import type { AdminLoginStep } from "../contracts/dto";

/** Second-factor failures allowed before the account's 2FA step locks. */
export const MFA_MAX_FAILURES = 5;
export const MFA_LOCK_MS = 15 * 60 * 1000;
/** A password-only session must finish 2FA (or enrolment) within this time. */
export const MFA_PENDING_SESSION_MS = 10 * 60 * 1000;

/**
 * What an admin must do after a correct password:
 * enrolled → verify a code; not enrolled but 2FA mandatory → enrol first; otherwise done.
 */
export function adminLoginStep(mfaEnabled: boolean, mfaRequired: boolean): AdminLoginStep {
  if (mfaEnabled) return "verify";
  return mfaRequired ? "enroll" : "done";
}
