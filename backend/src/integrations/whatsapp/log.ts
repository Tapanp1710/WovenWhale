import { randomToken } from "../../lib/crypto";
import { logger, maskPhone } from "../../lib/logger";
import { parseMetaWebhook, verifyMetaSignature } from "./meta-format";
import type { SendResult, WhatsAppProvider, WhatsAppWebhookEvent } from "./types";

/**
 * Development transport: records what would be sent without contacting Meta.
 * Accepts webhooks in the Cloud API envelope so the inbound pipeline can be
 * exercised locally (signed with WHATSAPP_APP_SECRET).
 */
export class LogWhatsAppProvider implements WhatsAppProvider {
  readonly name = "log";

  constructor(private readonly appSecret: string) {}

  async sendText(to: string, body: string): Promise<SendResult> {
    logger.info("whatsapp_text_logged", { to: maskPhone(to), chars: body.length });
    return { providerMessageId: `log_${randomToken(12)}` };
  }

  async sendTemplate(to: string, templateName: string, language: string, parameters: string[]): Promise<SendResult> {
    logger.info("whatsapp_template_logged", { to: maskPhone(to), templateName, language, params: parameters.length });
    return { providerMessageId: `log_${randomToken(12)}` };
  }

  verifyWebhookSignature(rawBody: string, headers: Headers): boolean {
    return verifyMetaSignature(this.appSecret, rawBody, headers);
  }

  parseWebhook(body: unknown): WhatsAppWebhookEvent[] {
    return parseMetaWebhook(body);
  }
}
