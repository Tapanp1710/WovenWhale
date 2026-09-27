# Architecture

## Repository layout

```
.
├── backend/                       Commerce API (Hono + Drizzle + PostgreSQL)
│   ├── drizzle/                   SQL migrations (generated + custom RLS migration)
│   ├── scripts/                   Operational CLIs: catalog import, production bootstrap
│   ├── seed/                      Development seed only (never imported by src/)
│   ├── src/
│   │   ├── app.ts                 HTTP app: middleware, route mounting, error mapping
│   │   ├── server.ts              Node entry: HTTP server + in-process job scheduler
│   │   ├── config/env.ts          Validated environment (fails fast on bad config)
│   │   ├── contracts/             Shared with the frontend: enums, Zod schemas, DTO types, labels
│   │   ├── db/                    Drizzle schema, client, migrator, SQL helpers
│   │   ├── domain/                Pure business rules — no I/O, fully unit tested
│   │   ├── integrations/          Provider interfaces + adapters (payments, OTP, WhatsApp, …)
│   │   ├── jobs/                  Idempotent background jobs
│   │   ├── lib/                   Cross-cutting: HTTP helpers, sessions/cookies, CSRF, rate limits, audit, logging
│   │   └── modules/               One folder per bounded context: routes + services
│   └── tests/                     Vitest unit tests
├── frontend/                      Storefront + admin (Next.js 16 App Router)
│   ├── e2e/                       Playwright end-to-end tests
│   └── src/
│       ├── app/(store)/           Storefront routes
│       ├── app/admin/             Admin routes (login + RBAC-gated panel)
│       ├── components/ui/         Design-system primitives
│       ├── components/store/      Storefront components
│       ├── components/admin/      Admin components
│       ├── lib/                   API clients, formatting, SEO, tracking helpers
│       └── proxy.ts               Optimistic admin-route redirect (Next 16 "proxy", formerly middleware)
└── docs/
```

Every React component is a `.tsx` file with a sibling `.module.css`. Design tokens (colour, type scale, spacing, radii, motion) are CSS custom properties in `frontend/src/app/globals.css`. Tailwind isn't used, because the project requires styles to live in stylesheets rather than markup; shadcn's accessible primitive (Radix Dialog) is used directly.

## Request flow

1. **Server-rendered pages** call the API from the Next.js server:
   - `publicApi()` for catalog data: no cookies, cached with `revalidate`, shared between visitors.
   - `sessionApi()` for personal data: forwards the visitor's cookies, `no-store`.
2. **Client interactions** call `/api/*` on the storefront origin. Next.js rewrites these to the API, so cookies are first-party, `HttpOnly`, `SameSite=Lax` (`Strict` for admin), and `Secure` in production.
3. The API validates every body and query with the shared Zod schemas, authenticates via opaque server-side sessions, authorises with RBAC, runs the domain rules and writes in transactions.

## Layers inside the API

| Layer | Responsibility | Rule |
| --- | --- | --- |
| `contracts/` | Types and schemas both apps share | Pure; imports only `zod` |
| `domain/` | Pricing, coupon validity, stock arithmetic, order/payment/return state machines, deadlines | Pure functions; no database, no clock (time is a parameter) |
| `modules/*/service.ts` | Use cases: place order, transition order, approve refund… | Owns transactions; calls domain rules; writes audit logs |
| `modules/*/routes.ts` | HTTP: parse, authorise, call service, shape DTO | No business logic |
| `integrations/` | Talking to the outside world | Interfaces first; business code never imports an adapter directly |

The single entry point for order status changes is `transitionOrder()` in [`modules/orders/lifecycle.ts`](../backend/src/modules/orders/lifecycle.ts). It validates the transition for the acting party, then applies every side effect (stock, coupons, refunds, history, notifications) in the caller's transaction. See [order-state-machine.md](order-state-machine.md).

## Consistency and concurrency

- **Stock:** `inventory` rows are locked (`SELECT … FOR UPDATE`, in variant-id order to avoid deadlocks) before any movement, and check constraints (`reserved ≤ on_hand`, both ≥ 0) make overselling impossible even if application code were wrong. Every movement is journalled in `inventory_transactions`.
- **Coupons:** usage increments are conditional (`used_count < usage_limit`) inside the order transaction, and coupon rows are locked while an order is priced.
- **Idempotency:** order placement is keyed by `(user_id, idempotency_key)`; payment webhooks by `(provider, provider_event_id)`. The dedupe row commits together with its effects, so a failed webhook is retried rather than dropped.
- **Outbox:** customer notifications are queued as rows in the same transaction as the business change and delivered afterwards, so nothing is sent for work that rolled back.

## Background jobs

Defined once in [`jobs/index.ts`](../backend/src/jobs/index.ts), each job is idempotent:

| Job | Every | Purpose |
| --- | --- | --- |
| `expire-unpaid-orders` | 1 min | Cancel prepaid orders whose payment window lapsed and release stock |
| `abandoned-checkouts` | 5 min | Mark inactive checkout sessions abandoned (no messaging until configured) |
| `dispatch-notifications` | 30 s | Deliver outbox notifications (skipped until WhatsApp is enabled) |
| `process-refunds` | 1 min | Send pending original-method refunds to the gateway |
| `purge-sessions` | 1 h | Delete expired sessions |

They run on an in-process scheduler (fine for one API instance), from cron via `npm run jobs:run`, or as BullMQ repeatable jobs: create one worker per job name that calls `JOBS[name].run` and disable the in-process scheduler with `DISABLE_SCHEDULER=true`.

## Scaling notes

- The rate limiter's store is in memory. For more than one API instance, implement `RateLimitStore` with Redis (`INCR` + `PEXPIRE`); the middleware doesn't change.
- Catalog responses carry `Cache-Control: public, max-age=30, stale-while-revalidate=300`, and the storefront caches them with `revalidate`. Personal responses are `private, no-store`.
- Analytics queries run directly against Postgres with supporting indexes. At higher volumes, move `customer_events` to a partitioned table or an analytics store and keep the DTOs unchanged.
