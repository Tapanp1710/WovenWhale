# Integrations

Every external service sits behind a small interface in [`backend/src/integrations/`](../backend/src/integrations). Business code only calls the interface; [`integrations/index.ts`](../backend/src/integrations/index.ts) is the one place that maps an environment variable to a concrete adapter. The platform runs end to end locally with the development adapters and no third-party credentials.

| Service | Interface | Development adapter | Selected by |
| --- | --- | --- | --- |
| Payments | `PaymentProvider` ([payments/types.ts](../backend/src/integrations/payments/types.ts)) | `MockPaymentProvider`: HMAC-signed callbacks and webhooks | `PAYMENT_PROVIDER` |
| OTP | `OTPProvider` ([otp/types.ts](../backend/src/integrations/otp/types.ts)) | `MockOTPProvider`: prints the code, stores only a keyed hash | `OTP_PROVIDER` |
| WhatsApp | `WhatsAppProvider` ([whatsapp/types.ts](../backend/src/integrations/whatsapp/types.ts)) | `LogWhatsAppProvider`: logs sends, parses Meta webhooks | `WHATSAPP_PROVIDER` |
| Shipping | `ShippingProvider` ([shipping/types.ts](../backend/src/integrations/shipping/types.ts)) | `ManualShippingProvider`: ops enter courier and AWB | `SHIPPING_PROVIDER` |
| Email | `EmailProvider` ([email/index.ts](../backend/src/integrations/email/index.ts)) | `ConsoleEmailProvider` | `EMAIL_PROVIDER` |
| Storage | `StorageProvider` ([storage/index.ts](../backend/src/integrations/storage/index.ts)) | Local disk; Supabase Storage adapter included | `STORAGE_PROVIDER` |

`mock` payment and OTP providers are rejected at boot when `NODE_ENV=production`.

## Adding an adapter

1. Implement the interface in a new file next to the development adapter.
2. Add its value to the provider enum in [`config/env.ts`](../backend/src/config/env.ts) and a `case` in `integrations/index.ts`.
3. Add its secrets to `.env.example` (server-only, never `NEXT_PUBLIC_`).
4. Register webhooks with the provider (URLs below) and set their secrets.

## Payments (Razorpay)

Contract: `createPayment` creates a gateway order and returns browser-safe checkout data; `verifyClientCallback` checks the signed payload the browser receives after paying; `parseWebhook` verifies the webhook signature against the **raw body**; `refund` issues refunds.

For Razorpay:

- `createPayment`: `POST https://api.razorpay.com/v1/orders` with basic auth `RAZORPAY_KEY_ID:RAZORPAY_KEY_SECRET`, `{ amount: amountPaise, currency: "INR", receipt: orderNumber }`. Return `{ providerOrderId: order.id, clientCheckout: { gateway: "razorpay", key: RAZORPAY_KEY_ID, providerOrderId: order.id, amountPaise, currency } }`.
- `verifyClientCallback`: expected signature is `HMAC_SHA256(RAZORPAY_KEY_SECRET, razorpay_order_id + "|" + razorpay_payment_id)`; compare with `safeEqual`.
- `parseWebhook`: verify `X-Razorpay-Signature` = `HMAC_SHA256(RAZORPAY_WEBHOOK_SECRET, rawBody)`; map `payment.captured`, `payment.failed`, `refund.processed`, `refund.failed`; use the webhook's event id as `eventId`.
- `refund`: `POST /v1/payments/{id}/refund` with `{ amount }`; Razorpay settles asynchronously, so return `status: "PROCESSING"` and let the `refund.processed` webhook complete it.
- Storefront: add a `razorpay` branch to [`PaymentGateway.tsx`](../frontend/src/components/store/checkout/PaymentGateway.tsx) that loads `https://checkout.razorpay.com/v1/checkout.js`, opens it with `clientCheckout`, and resolves with the handler's `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }` mapped to the adapter's callback shape.
- Webhook URL: `https://<api-host>/api/webhooks/payments/razorpay`.

Order confirmation happens only in `handleVerifiedPaymentEvent`, after verification, whichever of callback or webhook arrives first. Duplicates, late captures, amount mismatches and timeouts are covered in [order-state-machine.md](order-state-machine.md).

## OTP (MSG91, Twilio Verify or Supabase phone auth)

Contract: `sendOTP(phone) → { providerRef, codeHash }` and `verifyOTP({ phone, code, providerRef, codeHash }) → boolean`.

- Providers that verify on their side (Twilio Verify, MSG91 OTP, Supabase `signInWithOtp`/`verifyOtp`) return a `providerRef` and ignore `codeHash`.
- Providers that only deliver a message generate the code in the adapter and return its keyed hash; the auth module stores it and never keeps the plain code.
- Rate limits, attempt counting (5 per code), the 30-second resend cooldown and code expiry (10 minutes) are enforced by the auth module whichever provider you choose.

## WhatsApp (Meta Cloud API)

- Transport interface: `sendText`, `sendTemplate`, `verifyWebhookSignature` and `parseWebhook`. The Meta webhook format and `X-Hub-Signature-256` verification are already implemented in [`whatsapp/meta-format.ts`](../backend/src/integrations/whatsapp/meta-format.ts).
- A Meta adapter posts to `https://graph.facebook.com/v20.0/{WHATSAPP_PHONE_NUMBER_ID}/messages` with `Authorization: Bearer {WHATSAPP_ACCESS_TOKEN}`.
- Webhook URL: `https://<api-host>/api/webhooks/whatsapp`. The GET handshake uses `WHATSAPP_WEBHOOK_VERIFY_TOKEN`; POSTs are verified with `WHATSAPP_APP_SECRET`. Delivery, read and failed receipts update `whatsapp_messages` and `notifications`; inbound messages open a 24-hour service window on the conversation.

### How messages flow

1. Business actions (order placed, COD approved or rejected, shipped, delivered, cancelled, return and refund updates) queue a `notifications` row **in the same transaction** (transactional outbox).
2. The dispatcher sends pending rows using the template mapped to each topic in `whatsapp_templates`.
3. Nothing is sent unless `WHATSAPP_SEND_ENABLED=true` **and** the template is marked approved and active in **Admin → WhatsApp**; otherwise rows are recorded as `SKIPPED` with the reason. Marketing topics also require the customer's WhatsApp opt-in.

### Abandoned checkout recovery

Checkout sessions become `ABANDONED` after `ABANDONED_CHECKOUT_THRESHOLD_MINUTES` of inactivity and appear in **Admin → Abandoned checkouts** with the bag, amount, last activity and recovery status. Automated recovery messages are deliberately **not** sent yet. To enable them once business rules are agreed, queue an `ABANDONED_CHECKOUT` notification in `sweepAbandonedCheckouts()` ([jobs/index.ts](../backend/src/jobs/index.ts)); opt-in and template approval checks already apply.

## Shipping (Shiprocket, Delhivery)

Contract: `createShipment`, `generateAWB`, `generateLabel`, `track`, `cancelShipment`, `parseWebhook`. The `automated` flag tells the UI whether ops type the AWB (manual) or the provider assigns it.

- `createShipment` receives the address snapshot, items, COD amount and weight; an aggregator adapter books the shipment and returns its id, and optionally the AWB and courier.
- Tracking webhooks go to `https://<api-host>/api/webhooks/shipping/<provider>`. `applyTrackingEvents` deduplicates events and advances the order to `OUT_FOR_DELIVERY` or `DELIVERED` when the state machine allows it; out-of-order events are ignored.
- The manual provider already accepts a signed generic webhook (`x-shipping-signature: HMAC_SHA256(SHIPPING_WEBHOOK_SECRET, rawBody)`), which is useful for courier dashboards that can call a URL.

## Storage (Supabase Storage, S3, Cloudinary)

Images are stored as `(provider, storage_key)` and resolved to URLs by `resolveImageUrl()`; the UI never builds URLs itself. Current product photos are `external` references to the WooCommerce media on wovenwhale.com. To migrate:

1. Copy each image into the new store under a stable key.
2. Update the row's `provider` and `storage_key`.
3. Add the new host to `images.remotePatterns` in [`frontend/next.config.ts`](../frontend/next.config.ts) (Supabase is added automatically from `SUPABASE_URL`).

No UI changes are required.

## Monitoring (Sentry)

All unexpected API errors pass through `captureException()` in [`lib/monitoring.ts`](../backend/src/lib/monitoring.ts). Install `@sentry/node`, call `Sentry.init({ dsn: env.SENTRY_DSN })` at startup and forward to `Sentry.captureException` there. For the storefront, follow `@sentry/nextjs` setup; the error boundaries already surface a digest reference to customers.

## Queues (Redis, BullMQ)

Jobs are plain idempotent functions ([jobs/index.ts](../backend/src/jobs/index.ts)). With `REDIS_URL` set, register one BullMQ repeatable job per entry in `JOBS`, run a worker that calls `JOBS[name].run`, and start the API with `DISABLE_SCHEDULER=true`. Back the rate limiter with the same Redis (see [architecture.md](architecture.md)).
