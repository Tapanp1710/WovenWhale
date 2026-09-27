/**
 * One-time-password delivery/verification contract (OTPService).
 *
 * Providers that verify on their side (Twilio Verify, MSG91 OTP, Supabase
 * phone auth) return a `providerRef` and ignore `codeHash`. Providers that
 * only deliver a message return the hash of the code they sent so the auth
 * module can verify locally. Either way, plain codes are never persisted.
 */
export interface SendOTPResult {
  providerRef: string | null;
  codeHash: string | null;
}

export interface VerifyOTPInput {
  phone: string;
  code: string;
  providerRef: string | null;
  codeHash: string | null;
}

export interface OTPProvider {
  readonly name: string;
  sendOTP(phone: string): Promise<SendOTPResult>;
  verifyOTP(input: VerifyOTPInput): Promise<boolean>;
}
