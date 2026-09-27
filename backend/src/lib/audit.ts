import type { AdminContext } from "../app-env";
import type { DbOrTx } from "../db/client";
import { auditLogs } from "../db/schema";

/** Fields never copied into audit snapshots. */
const SENSITIVE = new Set(["passwordHash", "totpSecret", "tokenHash", "codeHash"]);

function snapshot(value: object | null | undefined): Record<string, unknown> | null {
  if (!value) return null;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([k]) => !SENSITIVE.has(k))
      .map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v]),
  );
}

/** Keeps only the fields that changed so audit rows stay readable. */
function diff(before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  if (!before || !after) return { before, after };
  const keys = Object.keys(after).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  return {
    before: Object.fromEntries(keys.map((k) => [k, before[k]])),
    after: Object.fromEntries(keys.map((k) => [k, after[k]])),
  };
}

/**
 * RULE 12: records an admin action. Call inside the same transaction as the
 * change so the trail and the data can never disagree.
 */
export async function recordAudit(
  db: DbOrTx,
  actor: Pick<AdminContext, "id" | "email"> | null,
  entry: { action: string; entityType: string; entityId: string; before?: object | null; after?: object | null },
) {
  const { before, after } = diff(snapshot(entry.before), snapshot(entry.after));
  await db.insert(auditLogs).values({
    actorAdminId: actor?.id ?? null,
    actorEmail: actor?.email ?? "system",
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before,
    after,
  });
}
