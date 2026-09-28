import type { InventoryTxnType } from "../contracts/enums";
import { fail, ok, type Result } from "./errors";

export interface StockLevel {
  onHand: number;
  reserved: number;
}

export type StockMovement =
  /** Hold units for a new order (COD awaiting approval / prepaid awaiting payment). */
  | { kind: "RESERVE"; quantity: number }
  /** Order confirmed: consume the reservation and deduct from on-hand. */
  | { kind: "COMMIT"; quantity: number }
  /** Order cancelled/rejected before confirmation: drop the reservation. */
  | { kind: "RELEASE"; quantity: number }
  /** Order cancelled after confirmation: goods never left — put back on-hand. */
  | { kind: "RESTOCK_CANCELLED"; quantity: number }
  /** Returned item received in sellable condition. */
  | { kind: "RETURN_RECEIVED"; quantity: number }
  /** Goods dispatched without a prior reservation (e.g. exchange replacement). */
  | { kind: "DISPATCH"; quantity: number }
  | { kind: "STOCK_IN"; quantity: number }
  /** Signed delta to on-hand for manual adjustments / cycle-count corrections. */
  | { kind: "ADJUST"; delta: number; type: "MANUAL_ADJUSTMENT" | "STOCK_CORRECTION" };

export interface PlannedMovement {
  type: InventoryTxnType;
  onHandDelta: number;
  reservedDelta: number;
  after: StockLevel;
}

export const available = (s: StockLevel) => s.onHand - s.reserved;

/**
 * Pure stock arithmetic. Returns the resulting level or a business error; the
 * persistence layer applies it under a row lock and the database check
 * constraints act as the final guard against overselling.
 */
export function planMovement(level: StockLevel, m: StockMovement): Result<PlannedMovement> {
  const qty = m.kind === "ADJUST" ? m.delta : m.quantity;
  if (m.kind !== "ADJUST" && (!Number.isInteger(qty) || qty <= 0)) {
    return fail("INVALID_QUANTITY", "Quantity must be a positive whole number.");
  }
  if (m.kind === "ADJUST" && (!Number.isInteger(qty) || qty === 0)) {
    return fail("INVALID_QUANTITY", "Adjustment must be a non-zero whole number.");
  }

  let type: InventoryTxnType;
  let onHandDelta = 0;
  let reservedDelta = 0;
  switch (m.kind) {
    case "RESERVE":
      if (available(level) < qty) return fail("INSUFFICIENT_STOCK", "Not enough stock available.");
      type = "ORDER_RESERVED";
      reservedDelta = qty;
      break;
    case "COMMIT":
      if (level.reserved < qty) return fail("RESERVATION_MISSING", "No matching stock reservation.");
      type = "ORDER_CONFIRMED";
      onHandDelta = -qty;
      reservedDelta = -qty;
      break;
    case "RELEASE":
      if (level.reserved < qty) return fail("RESERVATION_MISSING", "No matching stock reservation.");
      type = "ORDER_CANCELLED";
      reservedDelta = -qty;
      break;
    case "RESTOCK_CANCELLED":
      type = "ORDER_CANCELLED";
      onHandDelta = qty;
      break;
    case "RETURN_RECEIVED":
      type = "RETURN_RECEIVED";
      onHandDelta = qty;
      break;
    case "DISPATCH":
      if (available(level) < qty) return fail("INSUFFICIENT_STOCK", "Not enough stock available.");
      type = "ORDER_CONFIRMED";
      onHandDelta = -qty;
      break;
    case "STOCK_IN":
      type = "STOCK_IN";
      onHandDelta = qty;
      break;
    case "ADJUST":
      type = m.type;
      onHandDelta = qty;
      if (level.onHand + qty < 0) return fail("INSUFFICIENT_STOCK", "Insufficient stock.");
      if (level.onHand + qty < level.reserved) {
        return fail("BELOW_RESERVED", "Stock cannot go below units reserved for open orders.");
      }
      break;
  }

  const after = { onHand: level.onHand + onHandDelta, reserved: level.reserved + reservedDelta };
  if (after.onHand < 0 || after.reserved < 0 || after.reserved > after.onHand) {
    return fail("INSUFFICIENT_STOCK", "Not enough stock available.");
  }
  return ok({ type, onHandDelta, reservedDelta, after });
}
