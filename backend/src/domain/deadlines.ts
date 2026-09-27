const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** RULE 5: customer cancellation closes `windowHours` after the order was placed. */
export function computeCancelDeadline(placedAt: Date, windowHours: number): Date {
  return new Date(placedAt.getTime() + windowHours * HOUR_MS);
}

/** RULE 6: returns/exchanges/refunds close `windowDays` after delivery. */
export function computeReturnDeadline(deliveredAt: Date, windowDays: number): Date {
  return new Date(deliveredAt.getTime() + windowDays * DAY_MS);
}

export function computePaymentExpiry(createdAt: Date, timeoutMinutes: number): Date {
  return new Date(createdAt.getTime() + timeoutMinutes * 60 * 1000);
}
