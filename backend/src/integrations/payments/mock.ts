import { z } from "zod";
import { hmacSha256Hex, randomToken, safeEqual } from "../../lib/crypto";
import {
  InvalidSignatureError,
  type CreatePaymentInput,
  type CreatePaymentResult,
  type PaymentProvider,
  type RefundResult,
  type VerifiedPaymentEvent,
} from "./types";

const callbackSchema = z.object({
  providerOrderId: z.string().min(1),
  providerPaymentId: z.string().min(1),
  signature: z.string().min(1),
});

const webhookSchema = z.object({
  id: z.string(),
  event: z.enum(["payment.captured", "payment.failed", "refund.processed", "refund.failed"]),
  providerOrderId: z.string(),
  providerPaymentId: z.string().nullable(),
  amountPaise: z.number().int().nullable(),
  failureReason: z.string().nullable(),
  providerRefundId: z.string().nullable().default(null),
});

export const MOCK_SIGNATURE_HEADER = "x-mock-gateway-signature";

/**
 * Development gateway. Mirrors the real-world flow (server order → client
 * checkout → signed client callback + signed webhook) using HMAC signatures,
 * so the verification code paths are exercised exactly as in production.
 * Refused at boot when NODE_ENV=production.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";

  constructor(private readonly secret: string) {}

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const providerOrderId = `mock_order_${randomToken(12)}`;
    return {
      providerOrderId,
      clientCheckout: { gateway: "mock", providerOrderId, amountPaise: input.amountPaise, currency: input.currency },
    };
  }

  /** Signature the gateway attaches to the client callback: HMAC(orderId|paymentId). */
  signCallback(providerOrderId: string, providerPaymentId: string): string {
    return hmacSha256Hex(this.secret, `${providerOrderId}|${providerPaymentId}`);
  }

  signWebhook(rawBody: string): string {
    return hmacSha256Hex(this.secret, rawBody);
  }

  async verifyClientCallback(payload: unknown): Promise<VerifiedPaymentEvent | null> {
    const parsed = callbackSchema.safeParse(payload);
    if (!parsed.success) return null;
    const { providerOrderId, providerPaymentId, signature } = parsed.data;
    if (!safeEqual(signature, this.signCallback(providerOrderId, providerPaymentId))) return null;
    return {
      eventId: `callback_${providerPaymentId}`,
      type: "payment.captured",
      providerOrderId,
      providerPaymentId,
      amountPaise: null,
      failureReason: null,
      providerRefundId: null,
      raw: { providerOrderId, providerPaymentId, source: "client_callback" },
    };
  }

  async parseWebhook(rawBody: string, headers: Headers): Promise<VerifiedPaymentEvent> {
    const signature = headers.get(MOCK_SIGNATURE_HEADER) ?? "";
    if (!signature || !safeEqual(signature, this.signWebhook(rawBody))) throw new InvalidSignatureError();
    const body = webhookSchema.parse(JSON.parse(rawBody));
    return {
      eventId: body.id,
      type: body.event,
      providerOrderId: body.providerOrderId,
      providerPaymentId: body.providerPaymentId,
      amountPaise: body.amountPaise,
      failureReason: body.failureReason,
      providerRefundId: body.providerRefundId,
      raw: body,
    };
  }

  async refund(): Promise<RefundResult> {
    return { providerRefundId: `mock_rfnd_${randomToken(10)}`, status: "PROCESSED" };
  }
}
