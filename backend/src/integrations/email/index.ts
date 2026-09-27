import { logger } from "../../lib/logger";

/** Transactional e-mail contract (EmailService transport). */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<{ providerMessageId: string }>;
}

/** Development transport: logs the envelope (never the body) instead of sending. */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console";
  async send(message: EmailMessage) {
    logger.info("email_logged", { to: message.to.replace(/^(.).*(@.*)$/, "$1•••$2"), subject: message.subject });
    return { providerMessageId: `console_${Date.now()}` };
  }
}
