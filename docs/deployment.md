# Deployment

A production deployment has three parts:

| Component | Recommended host | Notes |
| --- | --- | --- |
| Storefront and admin (`frontend/`) | Vercel, or any Node host running `next start` | Needs `BACKEND_URL` to reach the API |
| Commerce API (`backend/`) | A long-running Node host (Render, Railway, Fly.io, ECS, a VM) | Runs the HTTP server and, for one instance, the job scheduler |
| Database | Supabase Postgres | Use the pooled connection string |

The API is a long-running process (background jobs, connection pool), so it's best on a container or VM host. If you prefer serverless for the API, set `DISABLE_SCHEDULER=true` and run `npm run jobs:run -w backend` from a scheduler every minute.

## 1. Database

1. Create the production Supabase project and copy the **pooled** connection string into the API's `DATABASE_URL`.
2. From CI or a trusted machine: `DATABASE_URL=... npm run db:migrate`.
3. Create the first super-admin (idempotent, production-safe):

   ```bash
   DATABASE_URL=... BOOTSTRAP_ADMIN_EMAIL=owner@wovenwhale.com BOOTSTRAP_ADMIN_PASSWORD='…' npm run db:bootstrap -w backend
   ```

4. Load the catalog from the official WooCommerce export (includes real stock):

   ```bash
   DATABASE_URL=... npm run catalog:import -- --csv=wc-product-export.csv --apply
   ```

5. **Do not** run `db:seed` in production (it refuses to when `NODE_ENV=production`).

## 2. API

```bash
npm ci
npm run build -w backend          # esbuild → backend/dist/server.js
NODE_ENV=production node backend/dist/server.js
```

Required environment: everything in `.env.example` that applies to production, in particular `NODE_ENV=production`, `DATABASE_URL`, `SESSION_SECRET`, `SITE_URL`, `ALLOWED_ORIGINS` (the storefront origin), provider selections and their secrets. The process validates configuration on boot and exits with a clear list of problems.

- Health check: `GET /api/health` (checks the database).
- Graceful shutdown on `SIGTERM`: stops the scheduler, closes the server and drains the pool.
- Run exactly **one** instance with the in-process scheduler, or run several with `DISABLE_SCHEDULER=true` plus an external scheduler, and back rate limits with Redis.
- Local uploads (`STORAGE_PROVIDER=local`) aren't suitable for multi-instance or ephemeral hosts; use `STORAGE_PROVIDER=supabase` in production.

## 3. Storefront

On Vercel:

1. Import the repository and set the root directory to `frontend`.
2. Set environment variables: `BACKEND_URL` (the API's internal or public URL), `SITE_URL`, `ADMIN_PORTAL_TRIGGER`, `SUPPORT_*`, and `SUPABASE_URL` if images are served from Supabase Storage.
3. Build command `npm run build`; output is handled by Vercel.

`next.config.ts` rewrites `/api/*` to `BACKEND_URL`, so the browser only ever talks to the storefront domain. Put the API behind the same private network or restrict it to the storefront's egress where your host allows.

## 4. Webhooks

Register these with each provider once its adapter is configured:

| Provider | URL | Secret |
| --- | --- | --- |
| Payment gateway | `https://<storefront-or-api>/api/webhooks/payments/<provider>` | e.g. `RAZORPAY_WEBHOOK_SECRET` |
| Shipping | `https://<storefront-or-api>/api/webhooks/shipping/<provider>` | `SHIPPING_WEBHOOK_SECRET` |
| WhatsApp | `https://<storefront-or-api>/api/webhooks/whatsapp` | `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` |

Webhook routes skip the browser-origin check and rely on signatures instead.

## 5. Environments

Keep separate Supabase projects, API instances and storefront deployments for staging and production, each with its own secrets. Never point staging at the production database.

## Releasing schema changes

1. `npm run db:generate` locally, review the SQL, commit.
2. Deploy: run `npm run db:migrate` **before** starting the new API version.
3. Write migrations to be backward compatible with the currently running version (add, backfill, then tighten in a later release).

## Rollback

- Storefront: redeploy the previous build (instant on Vercel).
- API: redeploy the previous image. Because migrations are additive, the previous version keeps working against the newer schema.
- Data: Supabase point-in-time recovery (enable it on the production project).

See the production checklist in the [README](../README.md#production-checklist).
