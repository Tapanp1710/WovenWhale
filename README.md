# WovenWhale Commerce

The direct-to-consumer commerce platform for **WovenWhale**, a handwoven menswear brand. It covers the customer storefront, the admin dashboard, and a commerce API with a Postgres database (Supabase in production).

| Area | Location | Stack |
| --- | --- | --- |
| Storefront and admin UI | [`frontend/`](frontend) | Next.js 16 (App Router), React 19, TypeScript, CSS Modules, Framer Motion, React Hook Form, Zod, Recharts |
| Commerce API | [`backend/`](backend) | Hono on Node.js, Drizzle ORM, PostgreSQL, Zod, Vitest |
| Shared contracts | [`backend/src/contracts`](backend/src/contracts) | Zod schemas, DTO types and lifecycle enums used by both apps |
| Docs | [`docs/`](docs) | Architecture, database, order state machine, integrations, deployment, security |

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

Open http://localhost:3000. In development the OTP code is the value of `OTP_DEV_FIXED_CODE` (default `123456`), and it is also printed in the API console.

### Development commands

| Command | What it does |
| --- | --- |
| `npm run dev` | API (watch mode) and storefront together |
| `npm run dev:backend` / `npm run dev:frontend` | Run one side |
| `npm run db:generate` | Generate a migration from schema changes (`backend/src/db/schema`) |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Seed reference data, the catalog snapshot and demo activity |
| `npm run db:reset` | **Local only.** Drop everything, migrate and seed again |
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
| Business rules | `ORDER_CANCELLATION_WINDOW_HOURS` (12), `RETURN_WINDOW_DAYS` (14), `PAYMENT_TIMEOUT_MINUTES`, `ABANDONED_CHECKOUT_THRESHOLD_MINUTES` | Deadlines are stored on each order when it's placed or delivered |
| Providers | `PAYMENT_PROVIDER`, `OTP_PROVIDER`, `WHATSAPP_PROVIDER`, `SHIPPING_PROVIDER`, `EMAIL_PROVIDER`, `STORAGE_PROVIDER` | `mock` payment/OTP are refused in production |
| Provider secrets | `RAZORPAY_*`, `OTP_API_KEY`, `WHATSAPP_*`, `SHIPPING_*`, `EMAIL_*`, `SUPABASE_SERVICE_ROLE_KEY` | Server only. Never prefix with `NEXT_PUBLIC_` |
| Messaging | `WHATSAPP_SEND_ENABLED` | Outbound WhatsApp stays off until this is `true` and templates are approved |
| Storefront | `ADMIN_PORTAL_TRIGGER`, `SUPPORT_EMAIL`, `SUPPORT_PHONE`, `SUPPORT_WHATSAPP`, `SUPPORT_HOURS` | Contact channels only appear when set |
| Operations | `REDIS_URL`, `SENTRY_DSN`, `RATE_LIMIT_MULTIPLIER`, `NEXT_DEV_FS_CACHE` | The multiplier must be 1 in production |

## Supabase setup

1. Create a Supabase project (Postgres 15+). Under **Project settings, Database**, copy the **pooled** connection string (Supavisor, transaction mode) into `DATABASE_URL`. The client already uses `prepare: false` for pooler compatibility.
2. Run `npm run db:migrate` against it. The `enable_rls` migration turns on Row Level Security for every table with no policies and revokes table access from `anon` and `authenticated`, so Supabase's auto-generated REST and GraphQL APIs expose nothing even if the anon key leaks. All data access goes through this API.
3. Optional: set `STORAGE_PROVIDER=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and create a **public** bucket named by `SUPABASE_STORAGE_BUCKET` for admin image uploads.
4. Use separate Supabase projects for staging and production, each with its own `.env`.

A note on the MCP config: [`.mcp.json`](.mcp.json) points the Supabase MCP server at `https://supabase.com/`, which isn't an MCP endpoint. Use `https://mcp.supabase.com/mcp?project_ref=<ref>` to connect tooling to a development project.

## Seed data

`npm run db:seed` loads:

- **Real:** the WovenWhale catalog from [`backend/seed/data/catalog.snapshot.json`](backend/seed/data/catalog.snapshot.json) (59 products: names, SKUs, prices, sizes, categories and image URLs from wovenwhale.com), roles, permissions and WhatsApp template placeholders.
- **Demo (clearly fake):** stock levels, featured/best-seller flags, 36 customers in the reserved `+91 70000 0xxxx` range with `@example.com` emails, 90 orders across every status (created through the real order services, then backdated), demo coupons (`WELCOME10`, `HANDLOOM15`, `FLAT200`, expired `MONSOON25`), abandoned checkouts and about 10,000 anonymous analytics events tagged `seed: true`.

The seed refuses to run when `NODE_ENV=production`. Seed code lives in [`backend/seed/`](backend/seed), separate from application code.

### Refreshing or replacing the catalog

```bash
npm run catalog:import                                   # live WooCommerce Store API → snapshot
npm run catalog:import -- --csv=wc-product-export.csv    # official WooCommerce CSV export (includes real stock)
npm run catalog:import -- --csv=export.csv --apply       # also upsert into the database
npm run catalog:import -- --csv=export.csv --apply --overwrite   # replace admin edits too
```

Imports are idempotent: products match on their WooCommerce ID, so re-running updates rows in place. Fabric, pattern and colour aren't in the WooCommerce data; the importer derives them from names and categories, and admins can correct them in the dashboard.

## Testing

```bash
npm test                     # 89 backend unit tests (Vitest)
npm run test:e2e             # Playwright end-to-end suite (starts servers if not running)
```

- **Unit tests** ([`backend/tests`](backend/tests)) cover coupon rules, price and discount allocation, inventory movements, order and payment state transitions, COD approval, the cancellation window, return eligibility, refund calculations and contract validation.
- **End-to-end tests** ([`frontend/e2e`](frontend/e2e)) cover browsing, search, filters and sort in the URL, the product page, the bag, prepaid and declined payments, COD pending approval then admin approval, COD rejection, cancellation inside and after 12 hours, and returns inside and after 14 days. Time windows are tested by moving the stored server-side deadline.

First run of Playwright needs a browser: `npx playwright install chromium` in `frontend/`. For repeated local runs set `RATE_LIMIT_MULTIPLIER=20` in `.env` (never in production).

## Build

```bash
npm run build                # esbuild bundle for the API, next build for the storefront
npm run start -w backend     # node dist/server.js
npm run start -w frontend    # next start
```

## Admin access

- Sign in at `/admin/login`. The development seed creates a super-admin from `SEED_SUPER_ADMIN_EMAIL` / `SEED_SUPER_ADMIN_PASSWORD` (default `owner@wovenwhale.local` / `ChangeMe!2026`). **Change it immediately.**
- In production, create the first super-admin with the idempotent bootstrap instead of the seed:

  ```bash
  BOOTSTRAP_ADMIN_EMAIL=owner@wovenwhale.com BOOTSTRAP_ADMIN_PASSWORD='a-strong-password' npm run db:bootstrap -w backend
  ```

- Roles: `SUPER_ADMIN`, `ADMIN`, `ORDER_MANAGER`, `INVENTORY_MANAGER`, `SUPPORT`. Permissions per role are editable in the dashboard; every admin change is written to the audit log.
- Typing the `ADMIN_PORTAL_TRIGGER` digits anywhere on the storefront (outside form fields) opens `/admin/login`. This is only a navigation shortcut; it ships in the page bundle and grants nothing.

## Integrations

Payments, OTP, WhatsApp, shipping, email and storage each have an interface and a development adapter. To go live you add an adapter and switch the provider variable. See [docs/integrations.md](docs/integrations.md) for each contract and a step-by-step for Razorpay, MSG91/Twilio/Supabase OTP, WhatsApp Cloud API and Shiprocket/Delhivery.

## Deployment

See [docs/deployment.md](docs/deployment.md) (Vercel for the storefront, a Node host for the API, Supabase for Postgres, cron for jobs).

## Production checklist

- [ ] `NODE_ENV=production`, a fresh 48-byte `SESSION_SECRET`, `RATE_LIMIT_MULTIPLIER=1`
- [ ] `DATABASE_URL` points at the production Supabase pooler; `npm run db:migrate` applied; RLS verified
- [ ] First super-admin created with `db:bootstrap`; seed **not** run; demo coupons absent
- [ ] Real payment and OTP adapters configured (`PAYMENT_PROVIDER`, `OTP_PROVIDER` are not `mock`)
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
