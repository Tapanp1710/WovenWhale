import { eq, inArray, sql } from "drizzle-orm";
import type { Tx } from "../../db/client";
import { inventory, inventoryTransactions } from "../../db/schema";
import { DomainError } from "../../domain/errors";
import { planMovement, type StockMovement } from "../../domain/inventory";

export interface MovementContext {
  orderId?: string | null;
  returnId?: string | null;
  adminUserId?: string | null;
  note?: string | null;
}

/**
 * Locks inventory rows for the given variants in a stable order (prevents
 * deadlocks between concurrent checkouts) and creates missing rows.
 */
export async function lockInventory(tx: Tx, variantIds: string[]) {
  const ids = [...new Set(variantIds)].sort();
  if (ids.length === 0) return new Map<string, { onHand: number; reserved: number }>();
  await tx
    .insert(inventory)
    .values(ids.map((variantId) => ({ variantId })))
    .onConflictDoNothing();
  const rows = await tx
    .select({ variantId: inventory.variantId, onHand: inventory.onHand, reserved: inventory.reserved })
    .from(inventory)
    .where(inArray(inventory.variantId, ids))
    .orderBy(inventory.variantId)
    .for("update");
  return new Map(rows.map((r) => [r.variantId, { onHand: r.onHand, reserved: r.reserved }]));
}

/**
 * RULE 8: applies one stock movement inside the caller's transaction and
 * journals it. Must be called on a row previously locked with `lockInventory`
 * (it locks on its own if not).
 */
export async function applyMovement(tx: Tx, variantId: string, movement: StockMovement, ctx: MovementContext = {}) {
  const locked = await lockInventory(tx, [variantId]);
  const level = locked.get(variantId)!;
  const plan = planMovement(level, movement);
  if (!plan.ok) {
    throw new DomainError(plan.code, plan.message, 409, { variantId });
  }
  const { type, onHandDelta, reservedDelta, after } = plan.value;
  await tx
    .update(inventory)
    .set({ onHand: after.onHand, reserved: after.reserved, updatedAt: sql`now()` })
    .where(eq(inventory.variantId, variantId));
  await tx.insert(inventoryTransactions).values({
    variantId,
    type,
    onHandDelta,
    reservedDelta,
    onHandAfter: after.onHand,
    reservedAfter: after.reserved,
    orderId: ctx.orderId ?? null,
    returnId: ctx.returnId ?? null,
    adminUserId: ctx.adminUserId ?? null,
    note: ctx.note ?? null,
  });
  return after;
}
