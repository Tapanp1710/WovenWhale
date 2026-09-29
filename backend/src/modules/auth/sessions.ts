import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { sessions } from "../../db/schema";
import { randomToken, sha256 } from "../../lib/crypto";

type Subject = "CUSTOMER" | "ADMIN";

/**
 * Opaque server-side sessions. The browser holds a random 256-bit token in an
 * HttpOnly cookie; the database stores only its SHA-256, so a database leak
 * does not yield usable session tokens. Sessions can be revoked instantly.
 */
export async function createSession(input: {
  subject: Subject;
  principalId: string;
  ttlMs: number;
  userAgent: string | null;
  mfaVerified?: boolean;
}) {
  const token = randomToken(32);
  await db.insert(sessions).values({
    tokenHash: sha256(token),
    subject: input.subject,
    userId: input.subject === "CUSTOMER" ? input.principalId : null,
    adminUserId: input.subject === "ADMIN" ? input.principalId : null,
    expiresAt: new Date(Date.now() + input.ttlMs),
    userAgent: input.userAgent?.slice(0, 256) ?? null,
    mfaVerified: input.mfaVerified ?? true,
  });
  return token;
}

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/** WHERE clause for a live session with this token; join it to load the principal in the same query. */
export const liveSession = (token: string, subject: Subject) =>
  and(eq(sessions.tokenHash, sha256(token)), eq(sessions.subject, subject), gt(sessions.expiresAt, new Date()));

/** Records activity at most every few minutes, so most requests cost no write. */
export async function touchSession(row: { id: string; lastSeenAt: Date }) {
  if (Date.now() - row.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, row.id));
  }
}

export async function revokeSession(token: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
}

export async function revokeAllAdminSessions(adminUserId: string) {
  await db.delete(sessions).where(eq(sessions.adminUserId, adminUserId));
}

export async function purgeExpiredSessions() {
  const deleted = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, sql`now()`))
    .returning({ id: sessions.id });
  return deleted.length;
}
