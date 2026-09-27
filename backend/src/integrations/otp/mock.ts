import { hmacSha256Hex, randomDigits, safeEqual } from "../../lib/crypto";
import { logger, maskPhone } from "../../lib/logger";
import type { OTPProvider, SendOTPResult, VerifyOTPInput } from "./types";

/**
 * Development OTP provider: generates a code, prints it to the server console
 * and stores only its keyed hash. `fixedCode` makes automated tests
 * deterministic. Refused at boot when NODE_ENV=production.
 */
export class MockOTPProvider implements OTPProvider {
  readonly name = "mock";

  constructor(
    private readonly hashKey: string,
    private readonly fixedCode: string,
  ) {}

  private hash(phone: string, code: string) {
    return hmacSha256Hex(this.hashKey, `${phone}:${code}`);
  }

  async sendOTP(phone: string): Promise<SendOTPResult> {
    const code = this.fixedCode || randomDigits(6);
    // Development only: surfaced in the console so a developer can sign in.
    console.log(`\n  [mock-otp] code for ${maskPhone(phone)}: ${code}\n`);
    logger.info("otp_sent", { provider: this.name, phone: maskPhone(phone) });
    return { providerRef: null, codeHash: this.hash(phone, code) };
  }

  async verifyOTP({ phone, code, codeHash }: VerifyOTPInput): Promise<boolean> {
    return Boolean(codeHash) && safeEqual(this.hash(phone, code), codeHash!);
  }
}
