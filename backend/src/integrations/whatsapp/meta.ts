import { logger, maskPhone } from "../../lib/logger";
import { parseMetaWebhook, verifyMetaSignature } from "./meta-format";
import type { SendResult, WhatsAppProvider, WhatsAppWebhookEvent } from "./types";

/**
 * WhatsApp Cloud API (Meta) transport. A successful send means Meta accepted
 * the message (status SENT); delivery and read receipts arrive later through
 * the webhook and are applied by the notifications module.
 */
export class MetaWhatsAppProvider implements WhatsAppProvider {
  readonly name = "meta";

  constructor(
    private readonly config: { accessToken: string; phoneNumberId: string; appSecret: string; graphVersion: string },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async send(to: string, message: Record<string, unknown>): Promise<SendResult> {
    const res = await this.fetchImpl(`https://graph.facebook.com/${this.config.graphVersion}/${this.config.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.config.accessToken}`, "Content-Type": "application/json" },
      // Cloud API expects the number without "+".
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: to.replace(/^\+/, ""), ...message }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
    const id = json.messages?.[0]?.id;
    if (!res.ok || !id) {
      logger.warn("whatsapp_send_failed", { to: maskPhone(to), status: res.status, code: json.error?.code });
      throw new Error(`WhatsApp send failed (${res.status}): ${json.error?.message ?? "no message id returned"}`);
    }
    return { providerMessageId: id };
  }

  sendText(to: string, body: string) {
    return this.send(to, { type: "text", text: { body, preview_url: false } });
  }

  sendTemplate(to: string, templateName: string, language: string, parameters: string[]) {
    return this.send(to, {
      type: "template",
      template: {
        name: templateName,
        language: { code: language },
        components: parameters.length ? [{ type: "body", parameters: parameters.map((text) => ({ type: "text", text })) }] : [],
      },
    });
  }

  verifyWebhookSignature(rawBody: string, headers: Headers): boolean {
    return verifyMetaSignature(this.config.appSecret, rawBody, headers);
  }

  parseWebhook(body: unknown): WhatsAppWebhookEvent[] {
    return parseMetaWebhook(body);
  }
}
