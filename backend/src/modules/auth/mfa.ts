import { and, count, eq, isNull, lt, or, sql } from "drizzle-orm";
import QRCode from "qrcode";
import { env, mfaKey } from "../../config/env";
import type { AdminMfaSetupDTO, AdminMfaStatusDTO } from "../../contracts/dto";
import { db } from "../../db/client";
import { adminRecoveryCodes, adminUsers } from "../../db/schema";
import { DomainError } from "../../domain/errors";
import { MFA_LOCK_MS, MFA_MAX_FAILURES } from "../../domain/mfa";
import { recordAudit } from "../../lib/audit";
import {
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  otpauthUrl,
  verifyTotp,
} from "../../lib/totp";
import { createSession, revokeAllAdminSessions } from "./sessions";

type Actor = { id: string; email: string };
type SecondFactor = { method: "totp" | "recovery"; code: string };

const ISSUER = "WovenWhale Admin";

const invalidCode = (left?: number) =>
  new DomainError(
    "MFA_INVALID",
    left !== undefined && left > 0 ? `That code didn't work. ${left} attempt${left === 1 ? "" : "s"} left.` : "That code didn't work.",
    401,
  );

async function loadAdmin(adminId: string) {
  const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.id, adminId));
  if (!admin) throw new DomainError("ADMIN_AUTH_REQUIRED", "Please sign in to the admin.", 401);
  return admin;
}

/**
 * Checks a TOTP code and records its time step in one conditional update, so
 * the same code can't be accepted twice (replay), even by parallel requests.
 */
async function consumeTotp(adminId: string, sealedSecret: string, code: string) {
  const step = verifyTotp(decryptSecret(sealedSecret, mfaKey), code);
  if (step === null) return false;
  const [row] = await db
    .update(adminUsers)
    .set({ totpLastStep: step })
    .where(and(eq(adminUsers.id, adminId), or(isNull(adminUsers.totpLastStep), lt(adminUsers.totpLastStep, step))))
    .returning({ id: adminUsers.id });
  return Boolean(row);
}

/** Marks one unused recovery code as used. Atomic: a code works exactly once. */
async function consumeRecoveryCode(adminId: string, code: string) {
  const [row] = await db
    .update(adminRecoveryCodes)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(adminRecoveryCodes.adminUserId, adminId),
        eq(adminRecoveryCodes.codeHash, hashRecoveryCode(code, mfaKey)),
        isNull(adminRecoveryCodes.usedAt),
      ),
    )
    .returning({ id: adminRecoveryCodes.id });
  return Boolean(row);
}

async function replaceRecoveryCodes(adminId: string) {
  const codes = generateRecoveryCodes();
  await db.transaction(async (tx) => {
    await tx.delete(adminRecoveryCodes).where(eq(adminRecoveryCodes.adminUserId, adminId));
    await tx.insert(adminRecoveryCodes).values(codes.map((c) => ({ adminUserId: adminId, codeHash: hashRecoveryCode(c, mfaKey) })));
  });
  return codes;
}

/** Replaces the admin's sessions with one fully verified session (session rotation after a privilege change). */
async function issueVerifiedSession(adminId: string, userAgent: string | null) {
  await revokeAllAdminSessions(adminId);
  return createSession({
    subject: "ADMIN",
    principalId: adminId,
    ttlMs: env.ADMIN_SESSION_TTL_HOURS * 60 * 60 * 1000,
    userAgent,
    mfaVerified: true,
  });
}

export async function mfaStatus(adminId: string, sessionVerified: boolean): Promise<AdminMfaStatusDTO> {
  const admin = await loadAdmin(adminId);
  const [remaining] = await db
    .select({ n: count() })
    .from(adminRecoveryCodes)
    .where(and(eq(adminRecoveryCodes.adminUserId, adminId), isNull(adminRecoveryCodes.usedAt)));
  return {
    email: admin.email,
    enabled: admin.totpEnabledAt !== null,
    required: env.ADMIN_MFA_REQUIRED,
    sessionVerified,
    recoveryCodesRemaining: Number(remaining?.n ?? 0),
  };
}

/** Starts (or restarts) enrolment: a fresh secret, stored encrypted, not active until confirmed with a code. */
export async function beginSetup(actor: Actor): Promise<AdminMfaSetupDTO> {
  const admin = await loadAdmin(actor.id);
  if (admin.totpEnabledAt) throw new DomainError("MFA_ALREADY_ENABLED", "Two-factor authentication is already on.", 409);
  const secret = generateTotpSecret();
  await db
    .update(adminUsers)
    .set({ totpSecret: encryptSecret(secret, mfaKey), totpLastStep: null })
    .where(eq(adminUsers.id, actor.id));
  const url = otpauthUrl(secret, admin.email, ISSUER);
  return { secret, otpauthUrl: url, qrDataUrl: await QRCode.toDataURL(url, { margin: 1, width: 240 }) };
}

/** Confirms enrolment with a first code, issues recovery codes and rotates the session. */
export async function enableMfa(actor: Actor, code: string, userAgent: string | null) {
  const admin = await loadAdmin(actor.id);
  if (admin.totpEnabledAt) throw new DomainError("MFA_ALREADY_ENABLED", "Two-factor authentication is already on.", 409);
  if (!admin.totpSecret) throw new DomainError("MFA_SETUP_REQUIRED", "Start setup again to get a new key.", 409);
  if (!(await consumeTotp(admin.id, admin.totpSecret, code))) throw invalidCode();

  await db
    .update(adminUsers)
    .set({ totpEnabledAt: new Date(), mfaFailedCount: 0, mfaLockedUntil: null })
    .where(eq(adminUsers.id, admin.id));
  const recoveryCodes = await replaceRecoveryCodes(admin.id);
  await recordAudit(db, actor, { action: "admin.mfa_enabled", entityType: "admin_user", entityId: admin.id });
  const token = await issueVerifiedSession(admin.id, userAgent);
  return { token, recoveryCodes };
}

/**
 * The second sign-in step. Each attempt is counted before the code is checked,
 * so parallel guessing is bounded; too many failures lock 2FA for 15 minutes.
 */
export async function verifySecondFactor(adminId: string, input: SecondFactor, userAgent: string | null) {
  const admin = await loadAdmin(adminId);
  if (!admin.totpEnabledAt || !admin.totpSecret) throw new DomainError("MFA_NOT_ENABLED", "Two-factor authentication isn't set up.", 409);

  const now = new Date();
  const [attempt] = await db
    .update(adminUsers)
    .set({ mfaFailedCount: sql`${adminUsers.mfaFailedCount} + 1` })
    .where(and(eq(adminUsers.id, adminId), or(isNull(adminUsers.mfaLockedUntil), lt(adminUsers.mfaLockedUntil, now))))
    .returning({ attempts: adminUsers.mfaFailedCount });
  const locked = new DomainError("MFA_LOCKED", "Too many incorrect codes. Try again in 15 minutes.", 429);
  if (!attempt) throw locked;
  if (attempt.attempts > MFA_MAX_FAILURES) {
    await db
      .update(adminUsers)
      .set({ mfaFailedCount: 0, mfaLockedUntil: new Date(now.getTime() + MFA_LOCK_MS) })
      .where(eq(adminUsers.id, adminId));
    await recordAudit(db, admin, { action: "admin.mfa_locked", entityType: "admin_user", entityId: adminId });
    throw locked;
  }

  const ok =
    input.method === "totp" ? await consumeTotp(adminId, admin.totpSecret, input.code) : await consumeRecoveryCode(adminId, input.code);
  if (!ok) {
    await recordAudit(db, admin, {
      action: "admin.mfa_failed",
      entityType: "admin_user",
      entityId: adminId,
      after: { method: input.method },
    });
    throw invalidCode(MFA_MAX_FAILURES - attempt.attempts);
  }

  await db.update(adminUsers).set({ mfaFailedCount: 0, mfaLockedUntil: null }).where(eq(adminUsers.id, adminId));
  await recordAudit(db, admin, {
    action: input.method === "totp" ? "admin.mfa_verified" : "admin.recovery_code_used",
    entityType: "admin_user",
    entityId: adminId,
  });
  return issueVerifiedSession(adminId, userAgent);
}

async function requireCurrentCode(adminId: string, code: string) {
  const admin = await loadAdmin(adminId);
  if (!admin.totpEnabledAt || !admin.totpSecret) throw new DomainError("MFA_NOT_ENABLED", "Two-factor authentication isn't set up.", 409);
  if (!(await consumeTotp(adminId, admin.totpSecret, code))) throw invalidCode();
}

export async function regenerateRecoveryCodes(actor: Actor, code: string) {
  await requireCurrentCode(actor.id, code);
  const codes = await replaceRecoveryCodes(actor.id);
  await recordAudit(db, actor, { action: "admin.recovery_codes_regenerated", entityType: "admin_user", entityId: actor.id });
  return codes;
}

export async function disableMfa(actor: Actor, code: string) {
  if (env.ADMIN_MFA_REQUIRED)
    throw new DomainError("MFA_REQUIRED_BY_POLICY", "Two-factor authentication is required for every admin.", 409);
  await requireCurrentCode(actor.id, code);
  await clearMfa(actor.id);
  await recordAudit(db, actor, { action: "admin.mfa_disabled", entityType: "admin_user", entityId: actor.id });
}

async function clearMfa(adminId: string) {
  await db.transaction(async (tx) => {
    await tx
      .update(adminUsers)
      .set({ totpSecret: null, totpEnabledAt: null, totpLastStep: null, mfaFailedCount: 0, mfaLockedUntil: null })
      .where(eq(adminUsers.id, adminId));
    await tx.delete(adminRecoveryCodes).where(eq(adminRecoveryCodes.adminUserId, adminId));
  });
}

/** For a lost device: another admin with `admins.manage` clears 2FA; the admin re-enrols at next sign-in. */
export async function resetMfa(actor: Actor, targetId: string) {
  if (actor.id === targetId) throw new DomainError("MFA_SELF_RESET", "Use your own security settings to change your 2FA.", 409);
  await loadAdmin(targetId);
  await clearMfa(targetId);
  await revokeAllAdminSessions(targetId);
  await recordAudit(db, actor, { action: "admin.mfa_reset", entityType: "admin_user", entityId: targetId });
}
