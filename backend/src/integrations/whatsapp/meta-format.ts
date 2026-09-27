import { hmacSha256Hex, safeEqual } from "../../lib/crypto";
import type { WhatsAppWebhookEvent } from "./types";

/** Meta signs webhooks with `X-Hub-Signature-256: sha256=<hmac(app_secret, raw_body)>`. */
export function verifyMetaSignature(appSecret: string, rawBody: string, headers: Headers): boolean {
  const header = headers.get("x-hub-signature-256") ?? "";
  if (!appSecret || !header.startsWith("sha256=")) return false;
  return safeEqual(header.slice(7), hmacSha256Hex(appSecret, rawBody));
}

interface MetaWebhookBody {
  entry?: {
    changes?: {
      value?: {
        statuses?: { id: string; status: string; timestamp: string; errors?: { title?: string }[] }[];
        messages?: { id: string; from: string; timestamp: string; type: string; text?: { body: string } }[];
      };
    }[];
  }[];
}

const STATUS_MAP: Record<string, "SENT" | "DELIVERED" | "READ" | "FAILED"> = {
  sent: "SENT",
  delivered: "DELIVERED",
  read: "READ",
  failed: "FAILED",
};

/** Parses the WhatsApp Cloud API webhook envelope into platform events. */
export function parseMetaWebhook(body: unknown): WhatsAppWebhookEvent[] {
  const events: WhatsAppWebhookEvent[] = [];
  for (const entry of (body as MetaWebhookBody)?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const s of change.value?.statuses ?? []) {
        const status = STATUS_MAP[s.status];
        if (!status) continue;
        events.push({
          kind: "status",
          providerMessageId: s.id,
          status,
          timestamp: new Date(Number(s.timestamp) * 1000),
          error: s.errors?.[0]?.title ?? null,
        });
      }
      for (const m of change.value?.messages ?? []) {
        events.push({
          kind: "inbound",
          providerMessageId: m.id,
          from: `+${m.from.replace(/^\+/, "")}`,
          body: m.type === "text" ? (m.text?.body ?? "") : `[${m.type}]`,
          timestamp: new Date(Number(m.timestamp) * 1000),
        });
      }
    }
  }
  return events;
}
