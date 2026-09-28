# Integrations

Every external service sits behind a small interface in [`backend/src/integrations/`](../backend/src/integrations). Business code only calls the interface; [`integrations/index.ts`](../backend/src/integrations/index.ts) is the one place that maps an environment variable to a concrete adapter. The platform runs end to end locally with the development adapters and no third-party credentials.

| Service | Interface | Development adapter | Production adapter | Selected by |
| --- | --- | --- | --- | --- |
| Payments | `PaymentProvider` ([payments/types.ts](../backend/src/integrations/payments/types.ts)) | `mock`: HMAC-signed callbacks and webhooks | `razorpay` ([razorpay.ts](../backend/src/integrations/payments/razorpay.ts)) | `PAYMENT_PROVIDER` |
| OTP | `OTPProvider` ([otp/types.ts](../backend/src/integrations/otp/types.ts)) | `mock`: prints the code, stores only a keyed hash | `twilio` (Twilio Verify, [twilio.ts](../backend/src/integrations/otp/twilio.ts)) | `OTP_PROVIDER` |
| WhatsApp | `WhatsAppProvider` ([whatsapp/types.ts](../backend/src/integrations/whatsapp/types.ts)) | `log`: records nothing as sent | `meta` (Cloud API, [meta.ts](../backend/src/integrations/whatsapp/meta.ts)) | `WHATSAPP_PROVIDER` |
| Shipping | `ShippingProvider` ([shipping/types.ts](../backend/src/integrations/shipping/types.ts)) | `manual`: ops enter courier and AWB | `manual` today; aggregator adapter later | `SHIPPING_PROVIDER` |
| Email | `EmailProvider` ([email/index.ts](../backend/src/integrations/email/index.ts)) | `console` | not built yet | `EMAIL_PROVIDER` |
| Storage | `StorageProvider` ([storage/index.ts](../backend/src/integrations/storage/index.ts)) | Local disk | `supabase` | `STORAGE_PROVIDER` |

The adapters are implemented and unit-tested against each provider's documented API with a fake network ([providers.test.ts](../backend/tests/security/providers.test.ts)). They have **not** yet been run against the live services, because that needs your accounts: do the test-mode checks below in staging before switching production.

At boot the API checks the credentials for whichever providers are selected (in every environment), and in production it refuses `mock` payments and OTP altogether.

## Adding an adapter

1. Implement the interface in a new file next to the existing adapters.
2. Add its value to the provider enum in [`config/env.ts`](../backend/src/config/env.ts), its required variables to the credential check there, and a `case` in `integrations/index.ts`.
3. Add its variables to `.env.example` (server only, never `NEXT_PUBLIC_`).
4. Add unit tests with a fake `fetch`, then test against the provider's sandbox in staging.

## Payments: Razorpay

**Flow.** Checkout computes the total on the server and creates the order in `PENDING_PAYMENT` → `createPayment` creates a Razorpay order for exactly that amount (and refuses if Razorpay echoes a different one) → the storefront opens Razorpay Checkout ([PaymentGateway.tsx](../frontend/src/components/store/checkout/PaymentGateway.tsx)) → Checkout returns `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }` → the API verifies `HMAC_SHA256(key_secret, order_id|payment_id)` → the order becomes `CONFIRMED`. The `payment.captured` webhook does the same independently, so a closed browser tab still confirms the order. No admin approval is involved for prepaid orders.

**What protects it.**

| Risk | Handling |
| --- | --- |
| Forged success | Only a valid Checkout signature or a webhook signed with `RAZORPAY_WEBHOOK_SECRET` over the **raw** body can confirm an order. The browser's word is never enough. |
| Wrong amount | Captures whose amount differs from the payment row are recorded and never confirm the order. |
| Duplicate webhooks / retries | Each event id (`X-Razorpay-Event-Id`) is stored in `payment_events` in the same transaction as its effect; replays are no-ops. |
| Callback and webhook both arrive | The second one finds the payment already successful and does nothing. |
| Paid twice, or paid after expiry/cancellation | Marked as a duplicate and refunded automatically; excluded from the order's refundable balance. |
| Failed payment | Order stays `PENDING_PAYMENT` with payment `PAYMENT_FAILED`; the customer can retry, which creates a new Razorpay order. Unpaid orders expire after `PAYMENT_TIMEOUT_MINUTES` and release stock. |
| Refunds | `POST /v1/payments/{id}/refund`; Razorpay settles asynchronously, so the refund stays `PROCESSING` until the `refund.processed` / `refund.failed` webhook. |
| Other Razorpay events | Signed events the platform doesn't use (for example `order.paid`) get a `200` so Razorpay doesn't retry or disable the webhook. |

**Setting it up** (see the credential checklist in the README):

1. Razorpay dashboard → **Account & Settings → API keys**: generate **test** keys for development and staging, **live** keys for production (live keys need KYC activation).
2. **Payment capture**: set to automatic.
3. **Webhooks → Add**: URL `https://<storefront-domain>/api/webhooks/payments/razorpay`, a strong secret, events `payment.captured`, `payment.failed`, `refund.processed`, `refund.failed`.
4. Set `PAYMENT_PROVIDER=razorpay`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
5. In staging, pay with Razorpay's test cards and UPI IDs; confirm a success, a failure and a refund reach the right states.

## OTP: Twilio Verify

Contract: `sendOTP(phone) → { providerRef, codeHash }` and `verifyOTP(...) → boolean`. Twilio generates, delivers and checks the code, so the platform never sees it. Whatever the provider, the auth module still enforces:

- a 10-minute expiry and single use;
- five attempts per code, claimed atomically **before** checking, so parallel guesses can't exceed five;
- a 30-second resend cooldown, five sends per phone per hour and per-IP limits (anti SMS-pumping);
- a new session token on every sign-in (the old one is revoked).

Setup: Twilio console → **Verify → Services → Create** (enable SMS, or WhatsApp) → set `OTP_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`, optionally `TWILIO_VERIFY_CHANNEL=whatsapp`. Turn on Twilio's **Fraud Guard** and geo-permissions for India only.

SMS to Indian numbers requires DLT registration of the sender and template. Twilio Verify handles this for its own templates, but confirm with Twilio for your account. MSG91 is listed as an option in `OTP_PROVIDER` but has no adapter yet; selecting it stops the API at boot with a clear message.

## WhatsApp: Meta Cloud API

- `WHATSAPP_PROVIDER=meta` sends through `https://graph.facebook.com/{WHATSAPP_GRAPH_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}/messages` with `WHATSAPP_ACCESS_TOKEN`.
- A send is recorded as `SENT` only when Meta returns a message id. `DELIVERED`, `READ` and `FAILED` come only from Meta's signed status webhooks. Nothing is ever marked delivered locally.
- Webhook: `https://<storefront-domain>/api/webhooks/whatsapp`. The GET handshake compares `WHATSAPP_WEBHOOK_VERIFY_TOKEN` in constant time; every POST must carry `X-Hub-Signature-256` signed with `WHATSAPP_APP_SECRET` over the raw body.
- Inbound messages open a 24-hour customer-service window on the conversation. Inside it, admins with `whatsapp.reply` can answer from **Admin → WhatsApp**; outside it Meta only allows templates, so the reply box is replaced by an explanation.

### Messages and templates

| Topic | Sent when |
| --- | --- |
| `ORDER_PLACED`, `ORDER_CONFIRMED` | Order placed; prepaid payment verified |
| `COD_APPROVED`, `COD_REJECTED` | Admin decision on a COD order |
| `SHIPPING_UPDATE`, `DELIVERY_UPDATE` | Shipped; out for delivery / delivered |
| `ORDER_CANCELLED` | Cancelled by customer or admin |
| `RETURN_UPDATE`, `REFUND_UPDATE` | Return and refund progress |
| `ABANDONED_CHECKOUT` | Not queued automatically (see below) |
| `CUSTOMER_SUPPORT` | Template for re-opening a conversation after 24 hours |

Business actions queue a `notifications` row in the same transaction (transactional outbox). The dispatcher sends only when **all** of these hold, otherwise it records `SKIPPED` with the reason:

1. `WHATSAPP_SEND_ENABLED=true`;
2. `WHATSAPP_PROVIDER=meta` (the `log` provider never counts as sent);
3. the topic's template is approved by Meta **and** marked approved and active in **Admin → WhatsApp**;
4. for marketing topics, the customer opted in.

Setup: Meta Business Manager → WhatsApp → add and verify the business phone number (business verification required) → create a **system user** token with `whatsapp_business_messaging` → submit each template for approval with the variables shown in Admin → WhatsApp.

### Abandoned checkout recovery

Checkout sessions become `ABANDONED` after `ABANDONED_CHECKOUT_THRESHOLD_MINUTES` of inactivity and appear in **Admin → Abandoned checkouts**. Automated recovery messages are deliberately **not** sent. To enable them once the business rules are agreed, queue an `ABANDONED_CHECKOUT` notification in `sweepAbandonedCheckouts()` ([jobs/index.ts](../backend/src/jobs/index.ts)); the opt-in and approval checks above still apply.

## Shipping

Contract: `createShipment`, `generateAWB`, `generateLabel`, `track`, `cancelShipment`, `parseWebhook`. The core only knows courier, AWB, tracking URL, shipment status and events; no provider is required.

- **Manual provider (current):** ops enter courier, AWB and an optional **https** tracking link when shipping a packed order. The order moves to `SHIPPED` in the same transaction.
- **Tracking updates:** `POST /api/webhooks/shipping/<provider>`. The manual provider accepts `{ "events": [{ "awb", "status", "occurredAt", "id" }] }` signed as `x-shipping-signature: HMAC_SHA256(SHIPPING_WEBHOOK_SECRET, rawBody)`; with no secret configured every update is rejected. Events are deduplicated, and the order advances to `OUT_FOR_DELIVERY` / `DELIVERED` only when the state machine allows it. Out-of-order events are ignored.
- **Cancellation:** if recording a shipment fails after the provider booked it, the booking is cancelled with the provider. Orders can't be cancelled once `SHIPPED`; undeliverable parcels come back as `RTO` shipment events.
- **Adding Shiprocket or Delhivery:** implement `ShippingProvider` (book the shipment in `createShipment`, return AWB and courier, verify the provider's webhook signature in `parseWebhook`), add it to the registry, set `SHIPPING_PROVIDER`.

## Storage (Supabase Storage, S3, Cloudinary)

Images are stored as `(provider, storage_key)` and resolved to URLs by `resolveImageUrl()`; the UI never builds URLs itself. Every stored image is WebP ([`lib/images.ts`](../backend/src/lib/images.ts)): the catalog photos are `static` WebP files shipped with the storefront (`frontend/public/catalog`, created by `npm run catalog:images -w backend`), and admin uploads are converted to WebP before they reach the storage provider (`local` or `supabase`). To move images to another store:

1. Copy each image into the new store under a stable key.
2. Update the row's `provider` and `storage_key`.
3. Add the new host to `images.remotePatterns` in [`frontend/next.config.ts`](../frontend/next.config.ts) (Supabase is added automatically from `SUPABASE_URL`).

## Monitoring (Sentry)

All unexpected API errors pass through `captureException()` in [`lib/monitoring.ts`](../backend/src/lib/monitoring.ts). Install `@sentry/node`, call `Sentry.init({ dsn: env.SENTRY_DSN })` at startup and forward to `Sentry.captureException` there. For the storefront, follow `@sentry/nextjs` setup; the error boundaries already surface a digest reference to customers.

## Queues (Redis, BullMQ)

Jobs are plain idempotent functions ([jobs/index.ts](../backend/src/jobs/index.ts)). With `REDIS_URL` set, register one BullMQ repeatable job per entry in `JOBS`, run a worker that calls `JOBS[name].run`, and start the API with `DISABLE_SCHEDULER=true`. Back the rate limiter with the same Redis (see [architecture.md](architecture.md)).
