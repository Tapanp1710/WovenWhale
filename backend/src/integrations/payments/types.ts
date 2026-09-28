/**
 * Payment gateway contract. Business logic depends only on this interface —
 * swapping the mock gateway for Razorpay (or any other) is a new adapter plus
 * a PAYMENT_PROVIDER value; no order or checkout code changes.
 */

export interface CreatePaymentInput {
  orderId: string;
  orderNumber: string;
  amountPaise: number;
  currency: "INR";
  customer: { name: string; phone: string; email: string | null };
}

export interface CreatePaymentResult {
  providerOrderId: string;
  /** Opaque data the storefront passes to the gateway's client SDK. Never contains secrets. */
  clientCheckout: Record<string, string | number>;
}

export type PaymentEventType = "payment.captured" | "payment.failed" | "refund.processed" | "refund.failed";

/** A gateway event whose authenticity has already been verified. */
export interface VerifiedPaymentEvent {
  /** Unique per event — used to deduplicate webhook retries. */
  eventId: string;
  type: PaymentEventType;
  providerOrderId: string;
  providerPaymentId: string | null;
  amountPaise: number | null;
  failureReason: string | null;
  providerRefundId: string | null;
  /** Sanitised payload for the audit trail (no card data, no secrets). */
  raw: Record<string, unknown>;
}

export interface RefundResult {
  providerRefundId: string;
  status: "PROCESSING" | "PROCESSED";
}

export interface PaymentProvider {
  readonly name: string;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  /**
   * Verifies the signed payload the storefront receives from the gateway's
   * client SDK after checkout. Returns null when the signature is invalid.
   */
  verifyClientCallback(payload: unknown): Promise<VerifiedPaymentEvent | null>;
  /** Verifies the webhook signature and parses the event. Throws on an invalid signature. */
  parseWebhook(rawBody: string, headers: Headers): Promise<VerifiedPaymentEvent>;
  refund(input: { providerPaymentId: string; amountPaise: number; reason: string }): Promise<RefundResult>;
}

export class InvalidSignatureError extends Error {
  constructor(message = "Invalid webhook signature") {
    super(message);
    this.name = "InvalidSignatureError";
  }
}

/** A correctly signed webhook for an event type this platform doesn't act on (acknowledged, not retried). */
export class IgnoredWebhookEvent extends Error {
  constructor(readonly event: string) {
    super(`Ignored webhook event ${event}`);
    this.name = "IgnoredWebhookEvent";
  }
}
