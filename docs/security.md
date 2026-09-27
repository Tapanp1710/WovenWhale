# Security

## Authentication

**Customers** sign in with a mobile number and one-time code.

- Codes are never stored in plain text (keyed hash, or verified by the provider). Each code expires after 10 minutes and allows 5 attempts; the attempt is counted **before** verification so parallel guesses can't bypass the limit.
- Sends are rate-limited per IP and per phone number (anti SMS-pumping), with a 30-second resend cooldown.
- Blocked or deleted accounts can't sign in.

**Admins** sign in with email and password.

- Passwords are hashed with scrypt (Node's built-in, memory-hard) and compared in constant time. Unknown emails still run a hash so response time doesn't reveal which accounts exist.
- Five failed attempts lock the account for 15 minutes; login is also rate-limited per IP and per email.
- Sessions carry an `mfa_verified` flag, and admins with a TOTP secret get a session that the API rejects until a second factor is verified. The TOTP verification endpoint is the remaining piece to build before enrolling admins.
- Role or activation changes revoke that admin's sessions immediately.

**Sessions** are opaque 256-bit random tokens in `HttpOnly` cookies (`Secure` in production; `SameSite=Lax` for customers, `Strict` for admins). The database stores only a SHA-256 of each token, so a database leak doesn't yield usable sessions. Sessions can be revoked server-side and expire (30 days for customers, 12 hours for admins by default).

## Authorisation

- Every `/api/admin/*` route requires an admin session and checks a specific permission (`requirePermission`). Permissions are loaded fresh on every request.
- Roles and permissions live in the database (`roles`, `permissions`, `role_permissions`) and are editable by super-admins; the last active super-admin can't be demoted or deactivated.
- Customer resources are always queried by `(id, user_id)`: another customer's order, address or return returns `404`, never `403`, so nothing leaks about its existence.
- The storefront's hidden admin shortcut is navigation only; `/admin/*` pages also redirect cookie-less requests to sign-in (`proxy.ts`), but real authorisation is always the API's.

## Business-rule integrity

- Prices, discounts, shipping, COD fees, totals, stock and deadlines are computed on the server. The order request carries only ids, the payment method and the total the customer saw, which is a consistency check (`PRICE_CHANGED`), never an input.
- Payment success is trusted only from a verified signature (client callback or webhook), never from a browser redirect. Webhooks are verified on the raw body before parsing and processed idempotently.
- Cancellation and return windows are read from deadlines stored on the order, never from the client's clock.

## Web protections

| Threat | Mitigation |
| --- | --- |
| CSRF | State-changing requests must carry an `Origin` in `ALLOWED_ORIGINS` (falling back to `Referer` when cookies are present); plus `SameSite` cookies. Signed webhooks are exempt. |
| XSS | React escaping; product descriptions are imported as plain text and rendered as text (no `dangerouslySetInnerHTML` for content); JSON-LD is serialised with `<` escaped. |
| Clickjacking | `X-Frame-Options: DENY` on the storefront; `frame-ancestors 'none'` on the API. |
| Content sniffing | `X-Content-Type-Options: nosniff`. Uploaded images are checked by magic bytes, not the declared type, and capped at 8 MB. |
| Injection | All SQL goes through Drizzle's parameterised queries; the few raw fragments use bound parameters. `LIKE` patterns are escaped. |
| Abuse | Rate limits on OTP, login, cart writes, coupons, order placement, payment verification, tracking, newsletter and support forms. Body size capped at 256 KB (9 MB for image uploads). |
| Enumeration | Order tracking and newsletter signup give the same response whether or not a record exists. |
| Input handling | Every body and query parameter is validated with Zod; free text is trimmed and stripped of control characters. |

## Secrets and configuration

- Secrets are read only on the server from environment variables; `.env` is git-ignored and `.env.example` holds placeholders only.
- Nothing secret is prefixed `NEXT_PUBLIC_`. The Supabase service-role key is used only by the API's storage adapter.
- The API validates its configuration at boot and refuses to start in production with mock payment/OTP providers, the placeholder session secret, or relaxed rate limits.
- Development-only routes (`/api/dev/*`, the mock gateway) are not mounted in production.

## Data protection

- **Row Level Security** is enabled on every table with no policies, and `anon`/`authenticated` are revoked, so Supabase's public APIs expose nothing. New tables need the same (add `ALTER TABLE … ENABLE ROW LEVEL SECURITY` to their migration).
- Logs are structured JSON with automatic redaction of keys that look like secrets, tokens, cookies, passwords, OTPs or signatures. Phone numbers are masked in logs.
- Analytics events store an anonymous first-party visitor id and a few non-personal fields; no IP addresses, user-agent strings or fingerprints.
- Payment card and UPI details are never seen by this system.

## Audit trail

`recordAudit()` writes actor, action, entity, before/after (changed fields only, with sensitive fields stripped) in the same transaction as the change: product and price changes, stock adjustments, COD approvals and rejections, fulfilment steps, cancellations, return decisions, refund approvals and payouts, coupon changes, customer edits, settings, template edits and admin/role changes. Audit rows keep the actor's email so the trail survives admin deletion.

## Reporting a vulnerability

Email the store's security contact (set up a `security@` address before launch) with steps to reproduce. Please don't test against production customer data.
