/**
 * WhatsApp messaging contract (WhatsAppService transport).
 * Business code talks to the notifications module, which uses this transport;
 * nothing outside this folder knows about Meta's Graph API.
 */
export interface SendResult {
  providerMessageId: string;
}

export type WhatsAppWebhookEvent =
  | {
      kind: "status";
      providerMessageId: string;
      status: "SENT" | "DELIVERED" | "READ" | "FAILED";
      timestamp: Date;
      error: string | null;
    }
  | {
      kind: "inbound";
      providerMessageId: string;
      from: string;
      body: string;
      timestamp: Date;
    };

export interface WhatsAppProvider {
  readonly name: string;
  sendText(to: string, body: string): Promise<SendResult>;
  sendTemplate(to: string, templateName: string, language: string, parameters: string[]): Promise<SendResult>;
  /** Verifies the webhook signature header against the raw body. */
  verifyWebhookSignature(rawBody: string, headers: Headers): boolean;
  parseWebhook(body: unknown): WhatsAppWebhookEvent[];
}
