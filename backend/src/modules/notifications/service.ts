import { and, asc, eq, inArray } from "drizzle-orm";
import { env } from "../../config/env";
import type { NotificationTopic } from "../../contracts/enums";
import { db, type DbOrTx } from "../../db/client";
import { customerProfiles, notifications, users, whatsappConversations, whatsappMessages, whatsappTemplates } from "../../db/schema";
import { providers } from "../../integrations";
import { logger } from "../../lib/logger";
import { captureException } from "../../lib/monitoring";

/** Topics that are marketing (need explicit WhatsApp opt-in) rather than transactional. */
const MARKETING_TOPICS: readonly NotificationTopic[] = ["ABANDONED_CHECKOUT"];

/**
 * Transactional outbox: call inside the business transaction. The intent is
 * committed atomically with the change and delivered later by
 * `dispatchPendingNotifications`, so messages are never sent for rolled-back work.
 */
export async function queueNotification(
  tx: DbOrTx,
  input: { userId: string; topic: NotificationTopic; orderId?: string | null; payload: Record<string, string | number> },
) {
  const [user] = await tx.select({ phone: users.phone }).from(users).where(eq(users.id, input.userId));
  if (!user) return;
  await tx.insert(notifications).values({
    userId: input.userId,
    channel: "WHATSAPP",
    topic: input.topic,
    recipient: user.phone,
    payload: input.payload,
    orderId: input.orderId ?? null,
  });
}

async function markSkipped(id: string, reason: string) {
  await db.update(notifications).set({ status: "SKIPPED", error: reason }).where(eq(notifications.id, id));
}

/**
 * Delivers pending notifications through the WhatsApp transport. Nothing is
 * sent until WHATSAPP_SEND_ENABLED=true AND the topic's template is approved
 * and active — per business rules, outbound automation stays off until configured.
 */
export async function dispatchPendingNotifications(limit = 50) {
  const pending = await db
    .select()
    .from(notifications)
    .where(eq(notifications.status, "PENDING"))
    .orderBy(asc(notifications.createdAt))
    .limit(limit);
  if (pending.length === 0) return { sent: 0, skipped: 0 };

  const templates = await db
    .select()
    .from(whatsappTemplates)
    .where(inArray(whatsappTemplates.topic, [...new Set(pending.map((p) => p.topic))]));
  const templateByTopic = new Map(templates.map((t) => [t.topic, t]));

  let sent = 0;
  let skipped = 0;
  for (const n of pending) {
    if (!env.WHATSAPP_SEND_ENABLED) {
      await markSkipped(n.id, "WhatsApp sending disabled (WHATSAPP_SEND_ENABLED=false)");
      skipped++;
      continue;
    }
    // Never record a message as sent when no real transport exists.
    if (providers.whatsapp.name === "log") {
      await markSkipped(n.id, "No WhatsApp provider configured (WHATSAPP_PROVIDER=log)");
      skipped++;
      continue;
    }
    const template = templateByTopic.get(n.topic);
    if (!template?.isApproved || !template.isActive) {
      await markSkipped(n.id, "Template not approved/active");
      skipped++;
      continue;
    }
    if (MARKETING_TOPICS.includes(n.topic as NotificationTopic) && n.userId) {
      const [profile] = await db
        .select({ optIn: customerProfiles.whatsappOptIn })
        .from(customerProfiles)
        .where(eq(customerProfiles.userId, n.userId));
      if (!profile?.optIn) {
        await markSkipped(n.id, "Customer has not opted in to WhatsApp marketing");
        skipped++;
        continue;
      }
    }

    try {
      const params = template.variables.map((v) => String(n.payload[v] ?? ""));
      const { providerMessageId } = await providers.whatsapp.sendTemplate(
        n.recipient,
        template.providerTemplateName,
        template.language,
        params,
      );
      await db.transaction(async (tx) => {
        const [conversation] = await tx
          .insert(whatsappConversations)
          .values({ phone: n.recipient, userId: n.userId, lastMessageAt: new Date() })
          .onConflictDoUpdate({ target: whatsappConversations.phone, set: { lastMessageAt: new Date() } })
          .returning({ id: whatsappConversations.id });
        const body = template.previewBody.replace(/\{\{(\d+)\}\}/g, (_, i) => params[Number(i) - 1] ?? "");
        await tx.insert(whatsappMessages).values({
          conversationId: conversation!.id,
          notificationId: n.id,
          direction: "OUTBOUND",
          templateTopic: n.topic,
          body,
          providerMessageId,
          status: "SENT",
        });
        await tx
          .update(notifications)
          .set({ status: "SENT", providerMessageId, sentAt: new Date(), error: null })
          .where(eq(notifications.id, n.id));
      });
      sent++;
    } catch (error) {
      captureException(error, { notificationId: n.id });
      await db
        .update(notifications)
        .set({ status: "FAILED", error: String(error).slice(0, 500) })
        .where(eq(notifications.id, n.id));
    }
  }
  if (sent > 0) logger.info("notifications_dispatched", { sent, skipped });
  return { sent, skipped };
}

/** Applies delivery/read/failure receipts from the WhatsApp webhook. */
export async function applyDeliveryReceipt(
  providerMessageId: string,
  status: "SENT" | "DELIVERED" | "READ" | "FAILED",
  at: Date,
  error: string | null,
) {
  const set = status === "DELIVERED" ? { status, deliveredAt: at } : status === "READ" ? { status, readAt: at } : { status, error };
  await db.update(whatsappMessages).set(set).where(eq(whatsappMessages.providerMessageId, providerMessageId));
  await db
    .update(notifications)
    .set({ status, ...(error ? { error } : {}) })
    .where(and(eq(notifications.providerMessageId, providerMessageId)));
}

/** Stores an inbound customer message and opens the 24h customer-service window. */
export async function recordInboundMessage(from: string, body: string, providerMessageId: string, at: Date) {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.phone, from));
  await db.transaction(async (tx) => {
    const [conversation] = await tx
      .insert(whatsappConversations)
      .values({
        phone: from,
        userId: user?.id ?? null,
        lastMessageAt: at,
        serviceWindowExpiresAt: new Date(at.getTime() + 24 * 3600 * 1000),
      })
      .onConflictDoUpdate({
        target: whatsappConversations.phone,
        set: { lastMessageAt: at, serviceWindowExpiresAt: new Date(at.getTime() + 24 * 3600 * 1000) },
      })
      .returning({ id: whatsappConversations.id });
    await tx
      .insert(whatsappMessages)
      .values({ conversationId: conversation!.id, direction: "INBOUND", body, providerMessageId, status: "DELIVERED", deliveredAt: at })
      .onConflictDoNothing();
  });
}

let dispatchTimer: NodeJS.Timeout | null = null;
/** Debounced post-commit trigger so customers get messages promptly without blocking requests. */
export function kickNotificationDispatch() {
  if (dispatchTimer) return;
  dispatchTimer = setTimeout(() => {
    dispatchTimer = null;
    dispatchPendingNotifications().catch((e) => captureException(e, { job: "notifications" }));
  }, 250);
  dispatchTimer.unref();
}
