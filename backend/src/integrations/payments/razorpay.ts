import { z } from "zod";
import { hmacSha256Hex, safeEqual } from "../../lib/crypto";
import {
  IgnoredWebhookEvent,
  InvalidSignatureError,
  type CreatePaymentInput,
  type CreatePaymentResult,
  type PaymentEventType,
  type PaymentProvider,
  type RefundResult,
  type VerifiedPaymentEvent,
} from "./types";

const API = "https://api.razorpay.com/v1";
export const RAZORPAY_SIGNATURE_HEADER = "x-razorpay-signature";
const EVENT_ID_HEADER = "x-razorpay-event-id";

/** What Razorpay Checkout's `handler` returns after a successful payment. */
const callbackSchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

const paymentEntity = z.object({
  id: z.string(),
  order_id: z.string().nullable().optional(),
  amount: z.number().int(),
  currency: z.string(),
  error_description: z.string().nullable().optional(),
});

const webhookSchema = z.object({
  event: z.string(),
  created_at: z.number().optional(),
  payload: z.object({
    payment: z.object({ entity: paymentEntity }).optional(),
    refund: z.object({ entity: z.object({ id: z.string(), payment_id: z.string(), amount: z.number().int() }) }).optional(),
  }),
});

const HANDLED: ReadonlySet<string> = new Set<PaymentEventType>(["payment.captured", "payment.failed", "refund.processed", "refund.failed"]);

/**
 * Razorpay adapter (Orders API + Checkout + webhooks).
 *
 * Flow: createPayment makes a Razorpay order for the server-computed amount;
 * the storefront opens Checkout with it; the signed handler response and the
 * signed webhook are both verified here; only then does the order service
 * confirm the order. Enable automatic capture in the Razorpay dashboard.
 */
export class RazorpayPaymentProvider implements PaymentProvider {
  readonly name = "razorpay";

  constructor(
    private readonly keyId: string,
    private readonly keySecret: string,
    private readonly webhookSecret: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async call<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchImpl(`${API}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } };
    // Razorpay's error description is safe to log; it never echoes credentials.
    if (!res.ok) throw new Error(`Razorpay ${path} failed (${res.status}): ${json.error?.description ?? "unknown error"}`);
    return json;
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const order = await this.call<{ id: string; amount: number }>("/orders", {
      amount: input.amountPaise,
      currency: input.currency,
      receipt: input.orderNumber.slice(0, 40),
      notes: { orderNumber: input.orderNumber },
    });
    if (order.amount !== input.amountPaise) throw new Error("Razorpay order amount mismatch");
    return { providerOrderId: order.id, clientCheckout: this.checkoutFor({ ...input, providerOrderId: order.id }) };
  }

  /** The key id is Razorpay's publishable key; the secret never leaves the server. */
  checkoutFor(input: CreatePaymentInput & { providerOrderId: string }) {
    return {
      gateway: "razorpay",
      key: this.keyId,
      providerOrderId: input.providerOrderId,
      amountPaise: input.amountPaise,
      currency: input.currency,
      orderNumber: input.orderNumber,
      prefillName: input.customer.name,
      prefillContact: input.customer.phone,
      ...(input.customer.email ? { prefillEmail: input.customer.email } : {}),
    };
  }

  /** Checkout signature: HMAC_SHA256(key_secret, order_id + "|" + payment_id). */
  async verifyClientCallback(payload: unknown): Promise<VerifiedPaymentEvent | null> {
    const parsed = callbackSchema.safeParse(payload);
    if (!parsed.success) return null;
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = parsed.data;
    if (!safeEqual(signature, hmacSha256Hex(this.keySecret, `${orderId}|${paymentId}`))) return null;
    return {
      eventId: `callback_${paymentId}`,
      type: "payment.captured",
      providerOrderId: orderId,
      providerPaymentId: paymentId,
      amountPaise: null, // Razorpay only accepts the order's own amount against an order.
      failureReason: null,
      providerRefundId: null,
      raw: { providerOrderId: orderId, providerPaymentId: paymentId, source: "client_callback" },
    };
  }

  /** Webhook signature: HMAC_SHA256(webhook_secret, raw body), header X-Razorpay-Signature. */
  async parseWebhook(rawBody: string, headers: Headers): Promise<VerifiedPaymentEvent> {
    const signature = headers.get(RAZORPAY_SIGNATURE_HEADER) ?? "";
    if (!signature || !this.webhookSecret || !safeEqual(signature, hmacSha256Hex(this.webhookSecret, rawBody))) {
      throw new InvalidSignatureError();
    }
    const body = webhookSchema.parse(JSON.parse(rawBody));
    if (!HANDLED.has(body.event)) throw new IgnoredWebhookEvent(body.event);
    const payment = body.payload.payment?.entity;
    const refund = body.payload.refund?.entity;
    // Razorpay retries deliver the same event id header; fall back to a content-derived id.
    const eventId = headers.get(EVENT_ID_HEADER) ?? `${body.event}:${refund?.id ?? payment?.id ?? "unknown"}:${body.created_at ?? ""}`;
    return {
      eventId,
      type: body.event as PaymentEventType,
      providerOrderId: payment?.order_id ?? "",
      providerPaymentId: payment?.id ?? refund?.payment_id ?? null,
      amountPaise: body.event.startsWith("payment.") && payment ? payment.amount : null,
      failureReason: body.event === "payment.failed" ? (payment?.error_description ?? "Payment failed") : null,
      providerRefundId: refund?.id ?? null,
      // Only identifiers and amounts are kept; card/UPI/contact details in the payload are dropped.
      raw: { event: body.event, paymentId: payment?.id ?? null, orderId: payment?.order_id ?? null, refundId: refund?.id ?? null },
    };
  }

  async refund(input: { providerPaymentId: string; amountPaise: number; reason: string }): Promise<RefundResult> {
    const refund = await this.call<{ id: string; status: string }>(`/payments/${encodeURIComponent(input.providerPaymentId)}/refund`, {
      amount: input.amountPaise,
      notes: { reason: input.reason.slice(0, 250) },
    });
    // Razorpay settles asynchronously; refund.processed completes it via webhook.
    return { providerRefundId: refund.id, status: refund.status === "processed" ? "PROCESSED" : "PROCESSING" };
  }
}
