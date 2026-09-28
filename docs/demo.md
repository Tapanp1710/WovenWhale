# Demo

A demo deployment is the real application with `DEMO_MODE=true`: the mock payment gateway (or Razorpay **test** mode) and a fixed OTP code are allowed under `NODE_ENV=production`, and every storefront page shows a "Demo store" banner. Everything else (RBAC, 2FA, CSRF, rate limits, webhook verification, server-side pricing and stock) behaves exactly as in production.

> **DEMO ONLY.** The credentials below are public. Never seed them into a real store, and never combine `DEMO_MODE` with live Razorpay keys (the API refuses to start if you do).

## Accounts

### Customer

| | |
| --- | --- |
| Mobile | `70000 99999` (or any other valid 10-digit mobile number, which creates a new account) |
| OTP | `123456` (shown in the banner) |
| Ready-made orders | one **delivered today** (can be returned for 14 days), one **paid just now** (can be cancelled for 12 hours), one **cash on delivery** waiting for approval |
| Addresses | Home (default) and Work |

### Admins (sign in at `/admin/login`)

All share the password **`Demo-Only-2026!`** (`DEMO_ADMIN_PASSWORD`). On a demo deployment each is enrolled in 2FA with the same authenticator key, `DEMO_TOTP_SECRET` from your `.env.demo`: add it once to Google Authenticator, 1Password or similar ("Enter a setup key", time-based) and use the 6-digit code at sign-in.

| Email | Role | Can |
| --- | --- | --- |
| `owner@wovenwhale.local` | Super admin | Everything, including admin accounts, roles and 2FA resets |
| `admin@wovenwhale.local` | Admin | Everything except admin accounts |
| `orders@wovenwhale.local` | Order manager | Orders, COD approval, shipping, cancellations, returns |
| `inventory@wovenwhale.local` | Inventory manager | Products and stock |
| `support@wovenwhale.local` | Customer support | Read orders and customers, handle returns, reply on WhatsApp. **Cannot approve COD** |

Locally (`npm run db:seed`) the same accounts exist without 2FA (it's optional in development); the owner's password is `SEED_SUPER_ADMIN_PASSWORD` (`ChangeMe!2026` by default).

## Walkthrough

The `/admin` URL is also reachable by typing `7391` on any storefront page. That shortcut only opens the sign-in page; it grants nothing.

**Customer: prepaid order**
1. Home → a collection → filter by size or price → open a product. Or search "ikat".
2. Choose a size, add to bag, add another product to the wishlist (heart).
3. Bag → apply `FLAT200` (₹200 off orders over ₹1,499) or `WELCOME10` (first order, over ₹999). Try `MONSOON25`: it's expired and refused.
4. Checkout → sign in with the demo mobile and OTP → pick an address → **Pay online** → **Pay** in the simulated gateway (or a Razorpay test card).
5. The confirmation page shows **Confirmed**: the server verified the payment signature; no admin step is involved.
6. Account → Orders → the order → **Cancel order** (open for 12 hours).
7. Track any order at `/track-order` with the order number and mobile.

**Customer: return**
1. Account → Orders → the **delivered** order → **Return or exchange items** → pick the item and a reason → Send.

**COD**
1. Check out with **Cash on delivery** → the order is **Awaiting confirmation** (`PENDING_COD_APPROVAL`).
2. Sign in as `orders@…` → **COD approvals** → Approve → the order is **Confirmed**.
3. Open the order → Processing → Packed → **Ship** (courier, AWB and an `https://` tracking link) → Delivered.
4. Reject instead to end at **Rejected**, with no refund because nothing was paid.

**Return and refund (admin)**
1. **Returns** → the request → Approve → Mark as received (choose whether it goes back into stock) → Refund (to the original payment; the amount is capped at what's refundable) → Complete.
2. The order keeps its **Delivered** status; its payment status becomes **Refunded / Partially refunded**.

**Security**
1. Sign in as `support@…` → open a COD order → there is no Approve button, and a direct API call returns **403 Forbidden**.
2. Sign in as `orders@…` → approve it.
3. **Audit log** (as `owner@…`) → the approval, with who did it and when.
4. **Sign-in security** → 2FA status and recovery codes.

## Resetting the demo

Everything goes back to the seeded state: catalog, demo stock, demo customers and orders, the accounts above.

```bash
npm run demo:reset -- --confirm=<database host from .env.demo>
```

It refuses to run unless `.env.demo` has `DEMO_MODE=true` and you type the database host.

Locally: `npm run db:reset`.

## Setting up a demo deployment

See [deployment.md](deployment.md#demo-deployment).
