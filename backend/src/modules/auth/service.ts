import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { env } from "../../config/env";
import type { CustomerDTO } from "../../contracts/dto";
import { db } from "../../db/client";
import { adminUsers, customerProfiles, otpChallenges, users } from "../../db/schema";
import { DomainError } from "../../domain/errors";
import { adminLoginStep, MFA_PENDING_SESSION_MS } from "../../domain/mfa";
import { providers } from "../../integrations";
import { recordAudit } from "../../lib/audit";
import { hashPassword, verifyPassword } from "../../lib/crypto";
import { maskPhone } from "../../lib/logger";
import { consume } from "../../lib/rate-limit";
import { createSession } from "./sessions";

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
const OTP_MAX_ATTEMPTS = 5;

/* ─────────────────────────────── Customer OTP ────────────────────────────── */

export async function sendOtp(phone: string) {
  // Per-phone limits stop SMS pumping even when requests rotate IPs.
  await consume(`otp-send-phone:${phone}`, 5, 60 * 60 * 1000);

  const [last] = await db
    .select({ createdAt: otpChallenges.createdAt })
    .from(otpChallenges)
    .where(eq(otpChallenges.phone, phone))
    .orderBy(desc(otpChallenges.createdAt))
    .limit(1);
  if (last && Date.now() - last.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - (Date.now() - last.createdAt.getTime())) / 1000);
    throw new DomainError("OTP_COOLDOWN", `Please wait ${wait}s before requesting a new code.`, 429, { retryAfter: wait });
  }

  const { providerRef, codeHash } = await providers.otp.sendOTP(phone);
  // Invalidate older unused challenges for this phone.
  await db
    .update(otpChallenges)
    .set({ consumedAt: new Date() })
    .where(and(eq(otpChallenges.phone, phone), isNull(otpChallenges.consumedAt)));
  await db.insert(otpChallenges).values({
    phone,
    provider: providers.otp.name,
    providerRef,
    codeHash,
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
  });
  return { expiresInSeconds: OTP_TTL_MS / 1000, resendInSeconds: OTP_RESEND_COOLDOWN_MS / 1000, maskedPhone: maskPhone(phone) };
}

export async function verifyOtpAndSignIn(phone: string, code: string, userAgent: string | null) {
  const [challenge] = await db
    .select()
    .from(otpChallenges)
    .where(and(eq(otpChallenges.phone, phone), isNull(otpChallenges.consumedAt), gt(otpChallenges.expiresAt, new Date())))
    .orderBy(desc(otpChallenges.createdAt))
    .limit(1);
  if (!challenge) throw new DomainError("OTP_EXPIRED", "This code has expired. Request a new one.", 422);
  // Claim an attempt atomically before verifying: the conditional increment means
  // parallel guesses can never exceed the limit, whatever the row said when read.
  const [attempt] = await db
    .update(otpChallenges)
    .set({ attempts: sql`${otpChallenges.attempts} + 1` })
    .where(and(eq(otpChallenges.id, challenge.id), lt(otpChallenges.attempts, OTP_MAX_ATTEMPTS), isNull(otpChallenges.consumedAt)))
    .returning({ attempts: otpChallenges.attempts });
  if (!attempt) throw new DomainError("OTP_TOO_MANY_ATTEMPTS", "Too many incorrect attempts. Request a new code.", 429);

  const valid = await providers.otp.verifyOTP({ phone, code, providerRef: challenge.providerRef, codeHash: challenge.codeHash });
  if (!valid) {
    const left = OTP_MAX_ATTEMPTS - attempt.attempts;
    throw new DomainError(
      "OTP_INVALID",
      left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.` : "Incorrect code.",
      422,
    );
  }
  // Single use: only one request can consume the challenge.
  const [consumed] = await db
    .update(otpChallenges)
    .set({ consumedAt: new Date() })
    .where(and(eq(otpChallenges.id, challenge.id), isNull(otpChallenges.consumedAt)))
    .returning({ id: otpChallenges.id });
  if (!consumed) throw new DomainError("OTP_EXPIRED", "This code has expired. Request a new one.", 422);

  const now = new Date();
  const { user, isNew } = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(users).where(eq(users.phone, phone));
    if (existing) {
      if (existing.isBlocked || existing.deletedAt) {
        throw new DomainError("ACCOUNT_UNAVAILABLE", "This account is unavailable. Please contact support.", 403);
      }
      const [updated] = await tx
        .update(users)
        .set({ lastLoginAt: now, phoneVerifiedAt: existing.phoneVerifiedAt ?? now })
        .where(eq(users.id, existing.id))
        .returning();
      return { user: updated!, isNew: false };
    }
    const [created] = await tx.insert(users).values({ phone, phoneVerifiedAt: now, lastLoginAt: now }).returning();
    await tx.insert(customerProfiles).values({ userId: created!.id, acquisitionSource: "direct" });
    return { user: created!, isNew: true };
  });

  const token = await createSession({
    subject: "CUSTOMER",
    principalId: user.id,
    ttlMs: env.CUSTOMER_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    userAgent,
  });
  return { token, userId: user.id, isNew };
}

export async function getCustomer(userId: string): Promise<CustomerDTO> {
  const [row] = await db
    .select({
      id: users.id,
      phone: users.phone,
      email: users.email,
      fullName: users.fullName,
      whatsappOptIn: customerProfiles.whatsappOptIn,
      marketingOptIn: customerProfiles.marketingOptIn,
    })
    .from(users)
    .leftJoin(customerProfiles, eq(customerProfiles.userId, users.id))
    .where(eq(users.id, userId));
  if (!row) throw new DomainError("NOT_FOUND", "Account not found.", 404);
  return { ...row, whatsappOptIn: row.whatsappOptIn ?? false, marketingOptIn: row.marketingOptIn ?? false };
}

export async function updateProfile(
  userId: string,
  input: { fullName: string; email?: string | null; whatsappOptIn?: boolean; marketingOptIn?: boolean },
) {
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ fullName: input.fullName, ...(input.email !== undefined ? { email: input.email } : {}) })
        .where(eq(users.id, userId));
      if (input.whatsappOptIn !== undefined || input.marketingOptIn !== undefined) {
        await tx
          .insert(customerProfiles)
          .values({ userId, whatsappOptIn: input.whatsappOptIn ?? false, marketingOptIn: input.marketingOptIn ?? false })
          .onConflictDoUpdate({
            target: customerProfiles.userId,
            set: {
              ...(input.whatsappOptIn !== undefined ? { whatsappOptIn: input.whatsappOptIn } : {}),
              ...(input.marketingOptIn !== undefined ? { marketingOptIn: input.marketingOptIn } : {}),
            },
          });
      }
    });
  } catch (error) {
    if (String((error as { cause?: { code?: string } }).cause?.code ?? (error as { code?: string }).code) === "23505") {
      throw new DomainError("EMAIL_IN_USE", "This email is already linked to another account.", 409);
    }
    throw error;
  }
  return getCustomer(userId);
}

/* ────────────────────────────────── Admin ────────────────────────────────── */

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
// Pre-computed hash used when the email is unknown so response time doesn't reveal account existence.
const DUMMY_HASH = hashPassword("not-a-real-password-for-timing");

export async function adminLogin(email: string, password: string, userAgent: string | null) {
  await consume(`admin-login-email:${email}`, 10, LOCKOUT_MS);
  const [admin] = await db
    .select()
    .from(adminUsers)
    .where(eq(sql`lower(${adminUsers.email})`, email.toLowerCase()));

  if (!admin) {
    await verifyPassword(password, await DUMMY_HASH);
    throw new DomainError("INVALID_CREDENTIALS", "Incorrect email or password.", 401);
  }
  if (admin.lockedUntil && admin.lockedUntil > new Date()) {
    throw new DomainError("ACCOUNT_LOCKED", "Too many failed attempts. Try again in 15 minutes.", 429);
  }
  const ok = (await verifyPassword(password, admin.passwordHash)) && admin.isActive;
  if (!ok) {
    const failures = admin.failedLoginCount + 1;
    await db
      .update(adminUsers)
      .set({
        failedLoginCount: failures >= LOCKOUT_THRESHOLD ? 0 : failures,
        lockedUntil: failures >= LOCKOUT_THRESHOLD ? new Date(Date.now() + LOCKOUT_MS) : null,
      })
      .where(eq(adminUsers.id, admin.id));
    throw new DomainError("INVALID_CREDENTIALS", "Incorrect email or password.", 401);
  }

  await db.update(adminUsers).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(adminUsers.id, admin.id));
  // Enrolled admins (and, when 2FA is mandatory, unenrolled ones) get a short-lived
  // session that only the 2FA endpoints accept until the second step succeeds.
  const step = adminLoginStep(admin.totpEnabledAt !== null, env.ADMIN_MFA_REQUIRED);
  const ttlMs = step === "done" ? env.ADMIN_SESSION_TTL_HOURS * 60 * 60 * 1000 : MFA_PENDING_SESSION_MS;
  const token = await createSession({ subject: "ADMIN", principalId: admin.id, ttlMs, userAgent, mfaVerified: step === "done" });
  await recordAudit(db, admin, {
    action: "admin.login",
    entityType: "admin_user",
    entityId: admin.id,
  });
  return { token, step, ttlSeconds: ttlMs / 1000 };
}

