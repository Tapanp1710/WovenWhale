import { and, eq, lt } from "drizzle-orm";
import { env } from "../config/env";
import { db } from "../db/client";
import { checkoutSessions } from "../db/schema";
import { logger } from "../lib/logger";
import { captureException } from "../lib/monitoring";
import { purgeExpiredSessions } from "../modules/auth/sessions";
import { recordEvent } from "../modules/events/service";
import { dispatchPendingNotifications } from "../modules/notifications/service";
import { expireUnpaidOrders, processPendingRefunds } from "../modules/payments/service";

/**
 * Marks checkouts abandoned after ABANDONED_CHECKOUT_THRESHOLD_MINUTES of
 * inactivity without an order. Recovery messaging is deliberately NOT
 * triggered here: it stays off until the WhatsApp provider and recovery rules
 * are approved (see docs/integrations.md → Abandoned checkout recovery).
 */
export async function sweepAbandonedCheckouts() {
  const cutoff = new Date(Date.now() - env.ABANDONED_CHECKOUT_THRESHOLD_MINUTES * 60 * 1000);
  const abandoned = await db
    .update(checkoutSessions)
    .set({ status: "ABANDONED", abandonedAt: new Date() })
    .where(and(eq(checkoutSessions.status, "ACTIVE"), lt(checkoutSessions.lastActivityAt, cutoff)))
    .returning({ id: checkoutSessions.id, userId: checkoutSessions.userId, totalPaise: checkoutSessions.totalPaise });
  for (const s of abandoned) {
    await recordEvent({ type: "CHECKOUT_ABANDONED", userId: s.userId, metadata: { checkoutSessionId: s.id, total: s.totalPaise } });
  }
  return abandoned.length;
}

/**
 * Job catalogue. Each job is an idempotent function, so the same definitions
 * run on the in-process scheduler (single instance), from cron via
 * `npm run jobs:run`, or as BullMQ repeatable jobs when REDIS_URL is set
 * (one Worker per name calling `JOBS[name].run`).
 */
export const JOBS = {
  "expire-unpaid-orders": { everyMs: 60_000, run: expireUnpaidOrders },
  "abandoned-checkouts": { everyMs: 5 * 60_000, run: sweepAbandonedCheckouts },
  "dispatch-notifications": { everyMs: 30_000, run: () => dispatchPendingNotifications() },
  "process-refunds": { everyMs: 60_000, run: () => processPendingRefunds() },
  "purge-sessions": { everyMs: 60 * 60_000, run: purgeExpiredSessions },
} as const;

export async function runJob(name: keyof typeof JOBS) {
  try {
    const result = await JOBS[name].run();
    if (result) logger.info("job_completed", { job: name, result: JSON.stringify(result) });
  } catch (error) {
    captureException(error, { job: name });
  }
}

/** ponytail: in-process timers — run the API as a single scheduler instance, or move to BullMQ/cron when scaling out. */
export function startScheduler() {
  const timers = Object.entries(JOBS).map(([name, job]) => {
    const t = setInterval(() => void runJob(name as keyof typeof JOBS), job.everyMs);
    t.unref();
    return t;
  });
  return () => timers.forEach(clearInterval);
}
