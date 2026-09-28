# Security

## Authentication

**Customers** sign in with a mobile number and one-time code.

- Codes are never stored in plain text (keyed hash, or verified by the provider). Each code expires after 10 minutes, works once and allows 5 attempts. Each attempt is claimed with a conditional atomic update **before** the code is checked, so parallel guesses can't exceed five.
- Signing in always issues a new session token and revokes any session cookie the browser already had.
- Sends are rate-limited per IP and per phone number (anti SMS-pumping), with a 30-second resend cooldown.
- Blocked or deleted accounts can't sign in.

**Admins** sign in with email and password, then a second factor.

- Passwords are hashed with scrypt (Node's built-in, memory-hard) and compared in constant time. Unknown emails still run a hash so response time doesn't reveal which accounts exist.
- Five failed attempts lock the account for 15 minutes; login is also rate-limited per IP and per email.
- Role or activation changes revoke that admin's sessions immediately.

### Admin two-factor authentication (TOTP)

```
password ✓ → short-lived "pending" session (10 min, accepted only by /api/admin/auth/2fa/*)
          → TOTP or recovery code ✓ → session rotated to a new token, fully signed in
          → every admin request: session valid + 2FA satisfied + account active → RBAC permission check
```

- **Standard:** RFC 6238 TOTP (SHA-1, 30 s, 6 digits), compatible with Google Authenticator, Microsoft Authenticator, 1Password and Authy. Codes within ±30 s of clock drift are accepted.
- **Enrolment:** Admin → Sign-in security → Set up. A new secret is shown once as a QR code and text key; 2FA switches on only after a correct code confirms the app is set up. Enabling it signs the admin out everywhere else.
- **Secret storage:** AES-256-GCM with a key derived from `MFA_ENCRYPTION_KEY` (HKDF). The secret is never returned after setup and never logged or copied into audit snapshots.
- **Replay:** the time step of each accepted code is stored with a conditional update, so a code can't be used twice, even by parallel requests.
- **Recovery codes:** ten single-use codes (50 bits each), shown once, stored as HMAC hashes keyed by `MFA_ENCRYPTION_KEY`, each consumed atomically. They can be regenerated with a current code.
- **Brute force:** each attempt is counted **before** checking; the sixth attempt in a lock window locks 2FA for 15 minutes (even a correct code is then refused), plus a per-IP limit. A password-only session gains nothing from guessing: it expires in 10 minutes and can't reach any other endpoint.
- **Policy:** `ADMIN_MFA_REQUIRED=true` (enforced in production) sends unenrolled admins to enrolment at sign-in and rejects any older session without 2FA. With it on, admins can't turn 2FA off.
- **Lost device:** use a recovery code. If those are lost too, an admin with `admins.manage` resets that admin's 2FA (Admin users → Two-factor → Reset). This signs them out, is audited, and they must enrol again at next sign-in. Nobody can reset their own 2FA this way.
- **Audit events:** `admin.mfa_enabled`, `admin.mfa_verified`, `admin.mfa_failed`, `admin.mfa_locked`, `admin.recovery_code_used`, `admin.recovery_codes_regenerated`, `admin.mfa_disabled`, `admin.mfa_reset`.
- **Key rotation:** `MFA_ENCRYPTION_KEY` can't be rotated in place; rotating it means every admin re-enrols. Keep it in your secret manager with the same care as the database password.

**Sessions** are opaque 256-bit random tokens in `HttpOnly` cookies (`Secure` in production; `SameSite=Lax` for customers, `Strict` for admins). The database stores only a SHA-256 of each token, so a database leak doesn't yield usable sessions. Sessions can be revoked server-side and expire (30 days for customers, 12 hours for admins by default).

## Authorisation

- Every `/api/admin/*` route requires an admin session and checks a specific permission (`requirePermission`). Permissions are loaded fresh on every request.
- Roles and permissions live in the database (`roles`, `permissions`, `role_permissions`) and are editable by super-admins; the last active super-admin can't be demoted or deactivated.
- Customer resources are always queried by `(id, user_id)`: another customer's order, address or return returns `404`, never `403`, so nothing leaks about its existence.
- The storefront's hidden admin shortcut is navigation only; `/admin/*` pages also redirect cookie-less requests to sign-in (`proxy.ts`), but real authorisation is always the API's.

## Business-rule integrity

- Prices, discounts, shipping, COD fees, totals, stock and deadlines are computed on the server. The order request carries only ids, the payment method and the total the customer saw, which is a consistency check (`PRICE_CHANGED`), never an input.
- Payment success is trusted only from a verified signature (client callback or webhook), never from a browser redirect. Webhooks are verified on the raw body before parsing and processed idempotently; captures for the wrong amount never confirm an order.
- Refundable balance = real (non-duplicate) captures minus refunds against them. Refund retries re-check that balance under the order lock.
- Cancellation and return windows are read from deadlines stored on the order, never from the client's clock.

## Web protections

| Threat | Mitigation |
| --- | --- |
| CSRF | State-changing requests must carry an `Origin` in `ALLOWED_ORIGINS` (falling back to `Referer` when cookies are present); plus `SameSite` cookies. Signed webhooks are exempt. |
| XSS | React escaping; product descriptions are imported as plain text and rendered as text (no `dangerouslySetInnerHTML` for content); JSON-LD is serialised with `<` escaped. |
| Clickjacking | `X-Frame-Options: DENY` on the storefront; `frame-ancestors 'none'` on the API. |
| Content sniffing | `X-Content-Type-Options: nosniff`. Uploaded images are checked by magic bytes, not the declared type, and capped at 8 MB. |
| Injection | All SQL goes through Drizzle's parameterised queries; the few raw fragments use bound parameters. `LIKE` patterns are escaped. |
| Abuse | Rate limits on OTP, login, 2FA, cart writes, coupons, order placement, payment verification, tracking, newsletter, support forms and WhatsApp replies. Body size capped at 256 KB (9 MB for image uploads). |
| Spoofed client IPs | Forwarding headers are trusted only as configured: `CLIENT_IP_HEADER` (a header your edge overwrites) or `TRUSTED_PROXY_HOPS` (proxies you run that append to `X-Forwarded-For`); otherwise the TCP peer is used. Production refuses to boot without one of them. |
| Unsafe links | Shipment tracking links shown to customers must be `https://`. |
| Enumeration | Order tracking and newsletter signup give the same response whether or not a record exists. |
| Input handling | Every body and query parameter is validated with Zod; free text is trimmed and stripped of control characters. |

## Secrets and configuration

- Secrets are read only on the server from environment variables; `.env` is git-ignored and `.env.example` holds placeholders only.
- Nothing secret is prefixed `NEXT_PUBLIC_`. The Supabase service-role key is used only by the API's storage adapter.
- The API validates its configuration at boot. In every environment a selected provider must have its credentials. In production it also refuses mock payment/OTP providers, the placeholder session secret, relaxed rate limits, optional admin 2FA, a missing or reused `MFA_ENCRYPTION_KEY`, no client-IP configuration, non-https origins, and WhatsApp sending without a real provider (see [config-and-ip.test.ts](../backend/tests/security/config-and-ip.test.ts)).
- `/api/health` returns only `{ "status": "ok" }`.
- Development-only routes (`/api/dev/*`, the mock gateway) are not mounted in production.

## Data protection

- **Row Level Security** is enabled on every table with no policies, and `anon`/`authenticated` are revoked, so Supabase's public APIs expose nothing. New tables need the same (add `ALTER TABLE … ENABLE ROW LEVEL SECURITY` to their migration).
- Logs are structured JSON with automatic redaction of keys that look like secrets, tokens, cookies, passwords, OTPs or signatures. Phone numbers are masked in logs.
- Analytics events store an anonymous first-party visitor id and a few non-personal fields; no IP addresses, user-agent strings or fingerprints.
- Payment card and UPI details are never seen by this system.

## Audit trail

`recordAudit()` writes actor, action, entity, before/after (changed fields only, with sensitive fields stripped) in the same transaction as the change: product and price changes, stock adjustments, COD approvals and rejections, fulfilment steps, cancellations, return decisions, refund approvals and payouts, coupon changes, customer edits, settings, template edits and admin/role changes. Audit rows keep the actor's email so the trail survives admin deletion.

## Audit log (September 2026)

A full review covered authentication, sessions, RBAC, CSRF/CORS, injection, uploads, XSS, webhooks, money and stock integrity, rate limiting, configuration and logging. Found and fixed:

| Severity | Issue | Fix |
| --- | --- | --- |
| Medium | OTP attempt limit could be exceeded by parallel guesses | Atomic conditional attempt claim; single-use consumption |
| Medium | Rate limits keyed on a client-supplied `X-Forwarded-For` | Explicit trusted-proxy configuration, required in production |
| Medium | A refunded duplicate payment reduced the refundable balance of the real payment | Refund totals exclude refunds of duplicate captures |
| Low | Shipment tracking link accepted `javascript:` URLs | https only |
| Low | Address landmark sanitiser removed every letter "s" | Regex fixed, regression test added (no stored data was affected) |
| Low | Retrying a failed refund skipped the refundable-balance check and the audit log | Checked under the order lock, audited |
| Low | Malformed `Referer` caused a 500; WhatsApp verify token compared in variable time; health check exposed `NODE_ENV`; previous customer session kept on sign-in | Fixed |
| Bug | Reopening Razorpay checkout would have lacked the publishable key | Providers build resumed checkout data |

Reviewed and kept by design: support staff can add internal order notes (`orders.view`; each note records its author); COD-rejection and cancellation reasons appear in the customer's order history.

Production dependencies: `npm audit --omit=dev` reports 0 vulnerabilities.

## Reporting a vulnerability

Email the store's security contact (set up a `security@` address before launch) with steps to reproduce. Please don't test against production customer data.
