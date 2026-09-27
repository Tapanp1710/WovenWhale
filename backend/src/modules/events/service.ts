import type { CustomerEventType } from "../../contracts/enums";
import type { DbOrTx } from "../../db/client";
import { db } from "../../db/client";
import { customerEvents } from "../../db/schema";
import { logger } from "../../lib/logger";

export interface EventInput {
  type: CustomerEventType;
  visitorId?: string | null;
  userId?: string | null;
  productId?: string | null;
  orderId?: string | null;
  path?: string | null;
  metadata?: Record<string, string | number | boolean>;
}

/**
 * Records a behavioural event. Analytics must never break a purchase, so
 * failures outside a transaction are logged and swallowed.
 */
export async function recordEvent(event: EventInput, tx?: DbOrTx): Promise<void> {
  const row = {
    type: event.type,
    visitorId: event.visitorId ?? null,
    userId: event.userId ?? null,
    productId: event.productId ?? null,
    orderId: event.orderId ?? null,
    path: event.path ?? null,
    metadata: event.metadata ?? null,
  };
  if (tx) {
    await tx.insert(customerEvents).values(row);
    return;
  }
  try {
    await db.insert(customerEvents).values(row);
  } catch (error) {
    logger.warn("event_record_failed", { type: event.type, error: String(error) });
  }
}
