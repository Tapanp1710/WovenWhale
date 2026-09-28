import { logger, maskPhone } from "../../lib/logger";
import type { OTPProvider, SendOTPResult, VerifyOTPInput } from "./types";

/**
 * Twilio Verify. Twilio generates, delivers and checks the code, so this
 * platform never sees or stores it. Attempt limits, resend cooldown and
 * expiry are still enforced by the auth module on top of Twilio's own.
 */
export class TwilioVerifyOTPProvider implements OTPProvider {
  readonly name = "twilio";

  constructor(
    private readonly config: { accountSid: string; authToken: string; serviceSid: string; channel: "sms" | "whatsapp" },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async post(path: string, form: Record<string, string>) {
    return this.fetchImpl(`https://verify.twilio.com/v2/Services/${this.config.serviceSid}/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(form),
      signal: AbortSignal.timeout(15_000),
    });
  }

  async sendOTP(phone: string): Promise<SendOTPResult> {
    const res = await this.post("Verifications", { To: phone, Channel: this.config.channel });
    const json = (await res.json().catch(() => ({}))) as { sid?: string; code?: number; message?: string };
    if (!res.ok || !json.sid) {
      logger.warn("otp_send_failed", { provider: this.name, phone: maskPhone(phone), status: res.status, code: json.code });
      throw new Error(`Twilio Verify send failed (${res.status})`);
    }
    logger.info("otp_sent", { provider: this.name, phone: maskPhone(phone) });
    return { providerRef: json.sid, codeHash: null };
  }

  async verifyOTP({ phone, code }: VerifyOTPInput): Promise<boolean> {
    const res = await this.post("VerificationCheck", { To: phone, Code: code });
    // 404: the verification expired, was already approved, or hit Twilio's attempt limit.
    if (res.status === 404) return false;
    const json = (await res.json().catch(() => ({}))) as { status?: string };
    if (!res.ok) throw new Error(`Twilio Verify check failed (${res.status})`);
    return json.status === "approved";
  }
}
