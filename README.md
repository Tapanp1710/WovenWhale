# WovenWhale Commerce

The direct-to-consumer commerce platform for **WovenWhale**, a handwoven menswear brand. It covers the customer storefront, the admin dashboard, and a commerce API with a Postgres database (Supabase in production).

| Area | Location | Stack |
| --- | --- | --- |
| Storefront and admin UI | [`frontend/`](frontend) | Next.js 16 (App Router), React 19, TypeScript, CSS Modules, Framer Motion, React Hook Form, Zod, Recharts |
| Commerce API | [`backend/`](backend) | Hono on Node.js, Drizzle ORM, PostgreSQL, Zod, Vitest |
| Shared contracts | [`backend/src/contracts`](backend/src/contracts) | Zod schemas, DTO types and lifecycle enums used by both apps |
| Docs | [`docs/`](docs) | Architecture, database, Supabase, order state machine, integrations, deployment, security |

## Architecture at a glance

```
Browser ──► Next.js (frontend/)  ──/api/* rewrite──►  Hono API (backend/)  ──►  PostgreSQL (Supabase)
             server components ──── server fetch ────►     │
                                                           ├─ domain/        pure business rules (pricing, coupons, state machines)
                                                           ├─ modules/       HTTP routes + services per bounded context
                                                           ├─ integrations/  Payment, OTP, WhatsApp, Shipping, Email, Storage adapters
                                                           └─ jobs/          payment timeouts, abandoned checkouts, refunds, notifications
```

- The browser only ever talks to the storefront origin; `/api/*` is rewritten to the API, so session cookies stay first-party and HttpOnly.
- Every price, discount, total, stock check and deadline is computed on the server. The client never sends prices.
- External providers sit behind interfaces with development adapters, so the platform runs locally with no third-party credentials.

More detail: [docs/architecture.md](docs/architecture.md).

## Prerequisites

- Node.js 20.11+ (tested on 24) and npm 10+
- Docker (for local Postgres) or any PostgreSQL 15+ database

## Setup

```bash
npm install                  # installs both workspaces
cp .env.example .env         # then set SESSION_SECRET (see below)
npm run db:up                # starts Postgres on localhost:54329 (docker compose)
npm run db:migrate           # applies migrations, including deny-by-default RLS
npm run db:seed              # real WovenWhale catalog + clearly marked demo data
npm run dev                  # API on :4000, storefront on :3000
```

Generate a session secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Open http://localhost:3000. In development the OTP code is the value of `OTP_DEV_FIXED_CODE` (default `123456`), and it is also printed in the API console. These are **development-only** conveniences: production refuses the mock OTP provider.

### Development commands

| Command | What it does |
| --- | --- |
| `npm run dev` | API (watch mode) and storefront together |
| `npm run dev:backend` / `npm run dev:frontend` | Run one side |
| `npm run db:generate` | Generate a migration from schema changes (`backend/src/db/schema`) |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Seed reference data, the catalog snapshot and demo activity |
| `npm run db:verify` | Read-only check: migrations applied, RLS on every table, no Supabase API-role grants |
| `npm run db:reset` | **Local only** (refuses non-localhost databases). Drop everything, migrate and seed again, and clear the storefront's cached catalog data |
| `npm run catalog:import` | Refresh the catalog snapshot from wovenwhale.com (see below) |
| `npm run typecheck` | Type-check both workspaces |
| `npm run format` | Prettier across the repo |
| `npm run jobs:run -w backend` | Run every background job once (for cron) |

## Environment variables

All variables live in one root `.env`, read by both apps. [`.env.example`](.env.example) documents every key. The important groups:

| Group | Keys | Notes |
| --- | --- | --- |
| URLs | `SITE_URL`, `BACKEND_URL`, `ALLOWED_ORIGINS` | `ALLOWED_ORIGINS` drives the CSRF origin check |
| Database | `DATABASE_URL`, `DATABASE_POOL_MAX` | Supabase pooled connection string in production |
| Sessions | `SESSION_SECRET`, `CUSTOMER_SESSION_TTL_DAYS`, `ADMIN_SESSION_TTL_HOURS` | The API refuses to boot in production with the placeholder secret |
| Admin 2FA | `ADMIN_MFA_REQUIRED`, `MFA_ENCRYPTION_KEY` | Required and a dedicated key in production; never rotate the key in place |
| Client IP | `CLIENT_IP_HEADER` or `TRUSTED_PROXY_HOPS` | One is required in production so rate limits see real clients ([deployment.md](docs/deployment.md#client-ip-for-rate-limiting)) |
| Business rules | `ORDER_CANCELLATION_WINDOW_HOURS` (12), `RETURN_WINDOW_DAYS` (14), `PAYMENT_TIMEOUT_MINUTES`, `ABANDONED_CHECKOUT_THRESHOLD_MINUTES` | Deadlines are stored on each order when it's placed or delivered |
| Providers | `PAYMENT_PROVIDER` (`mock`, `razorpay`), `OTP_PROVIDER` (`mock`, `twilio`), `WHATSAPP_PROVIDER` (`log`, `meta`), `SHIPPING_PROVIDER`, `EMAIL_PROVIDER`, `STORAGE_PROVIDER` | `mock` payment/OTP are refused in production; a selected provider's credentials are checked at boot |
| Provider secrets | `RAZORPAY_*`, `TWILIO_*`, `WHATSAPP_*`, `SHIPPING_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` | Server only. Never prefix with `NEXT_PUBLIC_` |
| Messaging | `WHATSAPP_SEND_ENABLED` | Outbound WhatsApp stays off until this is `true`, the provider is `meta` and templates are approved |
| Storefront | `ADMIN_PORTAL_TRIGGER`, `SUPPORT_EMAIL`, `SUPPORT_PHONE`, `SUPPORT_WHATSAPP`, `SUPPORT_HOURS` | Contact channels only appear when set |
| Operations | `REDIS_URL`, `SENTRY_DSN`, `RATE_LIMIT_MULTIPLIER`, `NEXT_DEV_FS_CACHE` | The multiplier must be 1 in production |

## Supabase

Development runs on local Docker Postgres by default. Every environment beyond that uses its own Supabase project. [docs/supabase.md](docs/supabase.md) covers:

- the **development / staging / production** split;
- connection strings (transaction pooler for the API);
- applying migrations and verifying them with `npm run db:verify`;
- connecting the **Supabase MCP server** (read-only, scoped to the development project, via [`.mcp.json`](.mcp.json));
- Storage, backups and restore drills, and how to reset each environment.

Row Level Security is on for every table with no policies, and Supabase's `anon`/`authenticated` roles hold no privileges (including on tables created later), so the auto-generated Data API exposes nothing even if the anon key leaks. The service-role key, if used for Storage, lives only in the API's environment.

## Seed data

`npm run db:seed` loads:

- **Real:** the WovenWhale catalog from [`backend/seed/data/catalog.snapshot.json`](backend/seed/data/catalog.snapshot.json) (59 products: names, SKUs, prices, sizes, categories and image URLs from wovenwhale.com), roles, permissions and WhatsApp template placeholders.
- **Demo (clearly fake):** stock levels, featured/best-seller flags, 36 customers in the reserved `+91 70000 0xxxx` range with `@example.com` emails, 90 orders across every status (created through the real order services, then backdated), demo coupons (`WELCOME10`, `HANDLOOM15`, `FLAT200`, expired `MONSOON25`), abandoned checkouts and about 10,000 anonymous analytics events tagged `seed: true`.

It also creates the **demo accounts** (one admin per role and a demo customer with ready-made orders): see [docs/demo.md](docs/demo.md).

The seed refuses to run when `NODE_ENV=production`, except on a labelled demo deployment (`DEMO_MODE=true`). Seed code lives in [`backend/seed/`](backend/seed), separate from application code.

### Refreshing or replacing the catalog

```bash
npm run catalog:import                                   # live WooCommerce Store API → snapshot
npm run catalog:import -- --csv=wc-product-export.csv    # official WooCommerce CSV export (includes real stock)
npm run catalog:import -- --csv=export.csv --apply       # also upsert into the database
npm run catalog:import -- --csv=export.csv --apply --overwrite   # replace admin edits too
npm run catalog:images -w backend                        # download new photos and convert them to WebP
```

**Images are WebP.** The 233 product photos live in [`frontend/public/catalog/`](frontend/public/catalog) as WebP files (at most 1400 px wide) and are served by the storefront itself, so the shop no longer depends on the old WooCommerce media server. The snapshot keeps each original URL for reference. After importing a new catalog, run `catalog:images`, then seed or apply. It only converts photos it doesn't have yet (`-- --force` redoes all). Images uploaded in the admin are converted to WebP on the server whatever format is uploaded, and the storefront's image optimiser delivers WebP.

Imports are idempotent: products match on their WooCommerce ID, so re-running updates rows in place. Fabric, pattern and colour aren't in the WooCommerce data; the importer derives them from names and categories, and admins can correct them in the dashboard.

## Testing

```bash
npm run typecheck            # both workspaces
npm test                     # 136 backend unit tests (Vitest)
npm run test:e2e             # 36 Playwright tests (starts servers if not running; needs the local database)
npm run db:verify            # schema, RLS and grants on the database in DATABASE_URL
npm run build                # production builds of both apps
```

- **Unit tests** ([`backend/tests`](backend/tests)) cover coupon rules, price and discount allocation, inventory movements, order and payment state transitions, COD approval, the cancellation window, return eligibility, refund calculations and contract validation. Security tests cover TOTP against the RFC 6238 vectors, secret encryption, recovery codes, the production configuration guard, client-IP handling, and signature verification for the Razorpay, Twilio, Meta WhatsApp and shipping adapters (with a fake network).
- **End-to-end tests** ([`frontend/e2e`](frontend/e2e)) cover browsing, search, filters and sort in the URL, the product page, the bag, prepaid and declined payments, COD pending approval then admin approval, COD rejection, cancellation inside and after 12 hours, and returns inside and after 14 days, admin sign-in, COD approval from the admin queue, and role-based access (a Support admin cannot approve COD). Admin 2FA tests cover enrolment, password-only sessions being useless, code replay, single-use recovery codes, lockout under parallel guessing and super-admin reset, plus the UI flow. Security tests cover unsigned and replayed payment webhooks, wrong-amount captures, parallel OTP guessing, unsigned WhatsApp/shipping webhooks, cross-site requests and client-supplied prices. Lifecycle tests take a prepaid order from payment through shipping (https-only tracking links), delivery, return, restock, a capped refund and completion, and cover the cart, coupons, wishlist, multiple addresses, the inventory ledger and per-role inventory and COD permissions with the audit trail. A UI sweep opens 29 pages at phone, tablet and desktop widths and fails on console errors, horizontal overflow or broken images. Time windows are tested by moving the stored server-side deadline.
- **Demo acceptance** ([`e2e/demo-acceptance.spec.ts`](frontend/e2e/demo-acceptance.spec.ts)) walks through the demo against a demo deployment with mandatory 2FA: `E2E_BASE_URL=<storefront> DEMO_TOTP_SECRET=<key> npx playwright test e2e/demo-acceptance.spec.ts` in `frontend/`. It is skipped in the normal run.

First run of Playwright needs a browser: `npx playwright install chromium` in `frontend/`. For repeated local runs set `RATE_LIMIT_MULTIPLIER=20` in `.env` (never in production). If ports 3000/4000 are used by another project, run the suite on others: `E2E_WEB_PORT=3200 E2E_API_PORT=4200 npm run test:e2e`.

## Build

```bash
npm run build                # esbuild bundle for the API, next build for the storefront
npm run start -w backend     # node dist/server.js
npm run start -w frontend    # next start
```

## Admin access

- Sign in at `/admin/login`. **Development only:** the seed creates a super-admin from `SEED_SUPER_ADMIN_EMAIL` / `SEED_SUPER_ADMIN_PASSWORD` (default `owner@wovenwhale.local` / `ChangeMe!2026`). This is a local test credential, never a production one.
- **Two-factor authentication:** after the password, admins enter a code from an authenticator app (or a single-use recovery code). Set it up under **Admin → Sign-in security**. It is mandatory in production (`ADMIN_MFA_REQUIRED=true`), where every admin enrols at first sign-in. Details: [docs/security.md](docs/security.md#admin-two-factor-authentication-totp).
- In production, create the first super-admin with the idempotent bootstrap instead of the seed:

  ```bash
  BOOTSTRAP_ADMIN_EMAIL=owner@wovenwhale.com BOOTSTRAP_ADMIN_PASSWORD='a-strong-password' npm run db:bootstrap -w backend
  ```

- Roles: `SUPER_ADMIN`, `ADMIN`, `ORDER_MANAGER`, `INVENTORY_MANAGER`, `SUPPORT`. Permissions per role are editable in the dashboard; every admin change is written to the audit log.
- Typing the `ADMIN_PORTAL_TRIGGER` digits anywhere on the storefront (outside form fields) opens `/admin/login`. This is only a navigation shortcut; it ships in the page bundle and grants nothing.

## Integrations

Payments, OTP, WhatsApp, shipping, email and storage each have an interface, a development adapter and, where built, a production adapter: **Razorpay** (payments), **Twilio Verify** (OTP) and the **Meta WhatsApp Cloud API**. They switch on with environment variables once you add credentials. They are tested against each provider's documented API but not yet against the live services. See [docs/integrations.md](docs/integrations.md).

## Deployment

See [docs/deployment.md](docs/deployment.md): Vercel for the storefront, the API as a Docker image ([`backend/Dockerfile`](backend/Dockerfile), [`render.yaml`](render.yaml) for Render) and Supabase for Postgres. The same guide has a step-by-step **demo deployment**.

## Demo

A demo deployment runs the real application with `DEMO_MODE=true`: simulated payments (or Razorpay test mode), OTP `123456`, a "Demo store" banner on every page, and demo accounts for every role with 2FA. Accounts, a scripted walkthrough and the reset command are in [docs/demo.md](docs/demo.md).

## What needs your accounts

Everything that can be built without your credentials is done. These need you:

| Service | Credentials → variables | Where | Environments | Verification needed |
| --- | --- | --- | --- | --- |
| Supabase | Project ref → `SUPABASE_DEV_PROJECT_REF` (shell); pooler URL → `DATABASE_URL`; optional `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | supabase.com → project → Connect / API settings | One project each: dev, staging, production | None; PITR is a paid add-on |
| Razorpay | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Dashboard → API keys; Webhooks | Test keys: dev/staging. Live keys: production | KYC and website review before live keys |
| Twilio Verify | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` | console.twilio.com → Verify → Services | Staging and production (separate services recommended) | Account upgrade from trial; confirm India SMS/DLT handling with Twilio |
| WhatsApp Cloud API | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (you choose it) | developers.facebook.com → your app → WhatsApp; Business Manager → System users | Test number: staging. Business number: production | Meta business verification, display-name approval, template approval |
| Shipping | `SHIPPING_WEBHOOK_SECRET` (you choose it) | Your courier or aggregator's webhook settings | Staging and production | Depends on the provider |
| Secrets you generate | `SESSION_SECRET`, `MFA_ENCRYPTION_KEY` | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` | Different in every environment | None |

## Production checklist

- [ ] `NODE_ENV=production`, a fresh 48-byte `SESSION_SECRET`, a different 48-byte `MFA_ENCRYPTION_KEY`, `ADMIN_MFA_REQUIRED=true`, `RATE_LIMIT_MULTIPLIER=1`
- [ ] `CLIENT_IP_HEADER` or `TRUSTED_PROXY_HOPS` set for your hosting and verified from two networks
- [ ] `DATABASE_URL` points at the production Supabase pooler; `npm run db:migrate` applied; `npm run db:verify` passes; point-in-time recovery enabled; a restore drill done in staging
- [ ] First super-admin created with `db:bootstrap` and enrolled in 2FA, recovery codes stored; seed **not** run; demo coupons absent
- [ ] `PAYMENT_PROVIDER=razorpay` with **live** keys (KYC complete) and `OTP_PROVIDER=twilio`, each tested end to end in staging first
- [ ] Payment, shipping and WhatsApp webhook URLs registered with each provider, with their secrets set
- [ ] `ALLOWED_ORIGINS` and `SITE_URL` set to the real storefront domain(s) over HTTPS
- [ ] `/api/dev/*` absent (it's only mounted outside production); confirm with a request
- [ ] Background jobs scheduled (single API instance scheduler or `npm run jobs:run` from cron)
- [ ] `SENTRY_DSN` set and the Sentry call wired in `backend/src/lib/monitoring.ts`
- [ ] If running more than one API instance: Redis-backed rate limiter and job queue (see docs/architecture.md)
- [ ] WhatsApp templates approved in Meta Business Manager and marked approved/active in the admin before setting `WHATSAPP_SEND_ENABLED=true`
- [ ] Legal review of the privacy, terms, shipping and return policy pages
- [ ] Contact channels (`SUPPORT_*`) set
- [ ] Catalog replaced with the official WooCommerce export, with real stock quantities
