import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { TwilioVerifyOTPProvider } from "../../src/integrations/otp/twilio";
import { RazorpayPaymentProvider } from "../../src/integrations/payments/razorpay";
import { IgnoredWebhookEvent, InvalidSignatureError } from "../../src/integrations/payments/types";
import { ManualShippingProvider } from "../../src/integrations/shipping/manual";
import { MetaWhatsAppProvider } from "../../src/integrations/whatsapp/meta";

const hmac = (secret: string, body: string) => createHmac("sha256", secret).update(body).digest("hex");

type Call = { url: string; init: RequestInit };
function fakeFetch(responses: { status: number; body: unknown }[]) {
  const calls: Call[] = [];
  const impl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift() ?? { status: 500, body: {} };
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { impl, calls };
}

describe("Razorpay adapter", () => {
  const KEY_SECRET = "rzp_test_secret_value";
  const WEBHOOK_SECRET = "rzp_webhook_secret_value";
  const rzp = (f?: typeof fetch) => new RazorpayPaymentProvider("rzp_test_key", KEY_SECRET, WEBHOOK_SECRET, f);

  it("creates a gateway order for the server amount; only the publishable key reaches the browser", async () => {
    const { impl, calls } = fakeFetch([{ status: 200, body: { id: "order_ABC", amount: 249900 } }]);
    const result = await rzp(impl).createPayment({
      orderId: "o1",
      orderNumber: "WW123",
      amountPaise: 249900,
      currency: "INR",
      customer: { name: "Meera", phone: "+919812345678", email: null },
    });
    expect(result.providerOrderId).toBe("order_ABC");
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({ amount: 249900, currency: "INR", receipt: "WW123" });
    expect(JSON.stringify(result.clientCheckout)).not.toContain(KEY_SECRET);
    expect(result.clientCheckout.key).toBe("rzp_test_key");
  });

  it("resuming an open attempt still gives Checkout the publishable key (and never the secret)", () => {
    const checkout = rzp().checkoutFor({
      orderId: "o1",
      orderNumber: "WW123",
      amountPaise: 249900,
      currency: "INR",
      customer: { name: "Meera", phone: "+919812345678", email: "meera@example.com" },
      providerOrderId: "order_ABC",
    });
    expect(checkout).toMatchObject({ gateway: "razorpay", key: "rzp_test_key", providerOrderId: "order_ABC", amountPaise: 249900 });
    expect(JSON.stringify(checkout)).not.toContain(KEY_SECRET);
  });

  it("refuses a gateway order whose amount differs", async () => {
    const { impl } = fakeFetch([{ status: 200, body: { id: "order_ABC", amount: 100 } }]);
    await expect(
      rzp(impl).createPayment({ orderId: "o", orderNumber: "WW1", amountPaise: 249900, currency: "INR", customer: { name: "", phone: "", email: null } }),
    ).rejects.toThrow(/mismatch/);
  });

  it("verifies the Checkout signature and rejects tampering", async () => {
    const good = { razorpay_order_id: "order_1", razorpay_payment_id: "pay_1", razorpay_signature: hmac(KEY_SECRET, "order_1|pay_1") };
    const event = await rzp().verifyClientCallback(good);
    expect(event).toMatchObject({ type: "payment.captured", providerOrderId: "order_1", providerPaymentId: "pay_1" });
    expect(await rzp().verifyClientCallback({ ...good, razorpay_payment_id: "pay_2" })).toBeNull();
    expect(await rzp().verifyClientCallback({ ...good, razorpay_signature: "0".repeat(64) })).toBeNull();
    expect(await rzp().verifyClientCallback({ status: "success" })).toBeNull();
  });

  const captured = JSON.stringify({
    event: "payment.captured",
    created_at: 1_790_000_000,
    payload: {
      payment: { entity: { id: "pay_1", order_id: "order_1", amount: 249900, currency: "INR", card: { last4: "1111" }, contact: "+919812345678" } },
    },
  });

  it("verifies webhooks on the raw body, keeps the event id for dedupe and drops personal data", async () => {
    const headers = new Headers({ "x-razorpay-signature": hmac(WEBHOOK_SECRET, captured), "x-razorpay-event-id": "evt_1" });
    const event = await rzp().parseWebhook(captured, headers);
    expect(event).toMatchObject({ eventId: "evt_1", type: "payment.captured", providerOrderId: "order_1", amountPaise: 249900 });
    expect(JSON.stringify(event.raw)).not.toMatch(/1111|9812345678/);
  });

  it("rejects webhooks with a missing, wrong or re-serialised signature", async () => {
    await expect(rzp().parseWebhook(captured, new Headers())).rejects.toBeInstanceOf(InvalidSignatureError);
    await expect(rzp().parseWebhook(captured, new Headers({ "x-razorpay-signature": hmac("other", captured) }))).rejects.toBeInstanceOf(
      InvalidSignatureError,
    );
    const reformatted = JSON.stringify(JSON.parse(captured), null, 2);
    await expect(
      rzp().parseWebhook(reformatted, new Headers({ "x-razorpay-signature": hmac(WEBHOOK_SECRET, captured) })),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("acknowledges signed events it doesn't act on", async () => {
    const body = JSON.stringify({ event: "order.paid", payload: {} });
    await expect(rzp().parseWebhook(body, new Headers({ "x-razorpay-signature": hmac(WEBHOOK_SECRET, body) }))).rejects.toBeInstanceOf(
      IgnoredWebhookEvent,
    );
  });

  it("maps refund events and refund API status", async () => {
    const body = JSON.stringify({
      event: "refund.processed",
      payload: { refund: { entity: { id: "rfnd_1", payment_id: "pay_1", amount: 5000 } }, payment: { entity: { id: "pay_1", order_id: "order_1", amount: 249900, currency: "INR" } } },
    });
    const event = await rzp().parseWebhook(body, new Headers({ "x-razorpay-signature": hmac(WEBHOOK_SECRET, body) }));
    expect(event).toMatchObject({ type: "refund.processed", providerRefundId: "rfnd_1", amountPaise: null });

    const { impl, calls } = fakeFetch([{ status: 200, body: { id: "rfnd_2", status: "pending" } }]);
    expect(await rzp(impl).refund({ providerPaymentId: "pay_1", amountPaise: 5000, reason: "Return" })).toEqual({
      providerRefundId: "rfnd_2",
      status: "PROCESSING",
    });
    expect(calls[0]!.url).toBe("https://api.razorpay.com/v1/payments/pay_1/refund");
  });
});

describe("Twilio Verify adapter", () => {
  const twilio = (f: typeof fetch) =>
    new TwilioVerifyOTPProvider({ accountSid: "AC1", authToken: "token", serviceSid: "VA1", channel: "sms" }, f);

  it("sends through Twilio and stores no code", async () => {
    const { impl, calls } = fakeFetch([{ status: 201, body: { sid: "VE1", status: "pending" } }]);
    expect(await twilio(impl).sendOTP("+919812345678")).toEqual({ providerRef: "VE1", codeHash: null });
    expect(String(calls[0]!.init.body)).toBe("To=%2B919812345678&Channel=sms");
  });

  it("approves only Twilio-approved codes; expired checks are a plain failure", async () => {
    const input = { phone: "+919812345678", code: "123456", providerRef: "VE1", codeHash: null };
    expect(await twilio(fakeFetch([{ status: 200, body: { status: "approved" } }]).impl).verifyOTP(input)).toBe(true);
    expect(await twilio(fakeFetch([{ status: 200, body: { status: "pending" } }]).impl).verifyOTP(input)).toBe(false);
    expect(await twilio(fakeFetch([{ status: 404, body: {} }]).impl).verifyOTP(input)).toBe(false);
  });
});

describe("WhatsApp Cloud API adapter", () => {
  const APP_SECRET = "meta_app_secret";
  const meta = (f?: typeof fetch) =>
    new MetaWhatsAppProvider({ accessToken: "token", phoneNumberId: "PN1", appSecret: APP_SECRET, graphVersion: "v21.0" }, f);

  it("sends approved templates and reports Meta's message id, never a fake one", async () => {
    const { impl, calls } = fakeFetch([{ status: 200, body: { messages: [{ id: "wamid.1" }] } }]);
    expect(await meta(impl).sendTemplate("+919812345678", "order_confirmed", "en", ["Meera", "WW1"])).toEqual({
      providerMessageId: "wamid.1",
    });
    const sent = JSON.parse(String(calls[0]!.init.body));
    expect(sent).toMatchObject({ to: "919812345678", type: "template", template: { name: "order_confirmed", language: { code: "en" } } });

    await expect(meta(fakeFetch([{ status: 400, body: { error: { message: "Template not approved" } } }]).impl).sendText("+91", "hi")).rejects.toThrow(
      /Template not approved/,
    );
  });

  it("accepts only webhooks signed with the app secret", () => {
    const body = JSON.stringify({ entry: [] });
    expect(meta().verifyWebhookSignature(body, new Headers({ "x-hub-signature-256": `sha256=${hmac(APP_SECRET, body)}` }))).toBe(true);
    expect(meta().verifyWebhookSignature(body, new Headers({ "x-hub-signature-256": `sha256=${hmac("wrong", body)}` }))).toBe(false);
    expect(meta().verifyWebhookSignature(body, new Headers())).toBe(false);
  });

  it("parses delivery receipts and inbound messages", () => {
    const events = meta().parseWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [{ id: "wamid.1", status: "delivered", timestamp: "1790000000" }],
                messages: [{ id: "wamid.2", from: "919812345678", timestamp: "1790000001", type: "text", text: { body: "Where is my order?" } }],
              },
            },
          ],
        },
      ],
    });
    expect(events.map((e) => e.kind)).toEqual(["status", "inbound"]);
  });
});

describe("shipping webhook", () => {
  const body = JSON.stringify({ events: [{ awb: "AWB1", status: "DELIVERED", occurredAt: "2026-09-20T10:00:00Z", id: "e1" }] });

  it("accepts a correctly signed tracking update", async () => {
    const events = await new ManualShippingProvider("ship_secret").parseWebhook(body, new Headers({ "x-shipping-signature": hmac("ship_secret", body) }));
    expect(events[0]).toMatchObject({ awb: "AWB1", status: "DELIVERED", providerEventId: "e1" });
  });

  it("rejects unsigned updates, and all updates when no secret is configured", async () => {
    await expect(new ManualShippingProvider("ship_secret").parseWebhook(body, new Headers())).rejects.toBeInstanceOf(InvalidSignatureError);
    await expect(new ManualShippingProvider("").parseWebhook(body, new Headers({ "x-shipping-signature": hmac("", body) }))).rejects.toBeInstanceOf(
      InvalidSignatureError,
    );
  });
});
