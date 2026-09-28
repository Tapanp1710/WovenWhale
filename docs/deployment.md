# Deployment

## Environments

| | Development | Staging | Production |
| --- | --- | --- | --- |
| Purpose | Building and testing locally | Rehearsal with real provider sandboxes | Customers |
| `NODE_ENV` | `development` | `production` | `production` |
| Database | Local Docker, or Supabase **dev** project | Supabase **staging** project | Supabase **production** project |
| Data | Seed (real catalog + fake demo activity) | Official catalog export, test customers | Real data only |
| Payments | `mock` | `razorpay` with **test** keys | `razorpay` with **live** keys |
| OTP | `mock` (fixed code `123456`) | `twilio` (a trial or dedicated service) | `twilio` |
| WhatsApp | `log`, sending off | `meta` test number, sending off until templates approved | `meta`, sending on only after approval |
| Admin 2FA | optional | required | required |
| Rate limits | may be relaxed (`RATE_LIMIT_MULTIPLIER`) for tests | 1 | 1 |

Staging runs with `NODE_ENV=production` on purpose, so every production safety check applies there first. Each environment has its own secrets; never copy production secrets into staging or development, and never point either at the production database.

## Components

| Component | Recommended host | Notes |
| --- | --- | --- |
| Storefront and admin (`frontend/`) | Vercel, or any Node host running `next start` | Needs `BACKEND_URL` to reach the API |
| Commerce API (`backend/`) | A long-running Node host (Render, Railway, Fly.io, ECS, a VM) | Runs the HTTP server and, for one instance, the job scheduler |
| Database | Supabase Postgres | See [supabase.md](supabase.md) |

The API is a long-running process (background jobs, connection pool), so it's best on a container or VM host. If you prefer serverless for the API, set `DISABLE_SCHEDULER=true` and run `npm run jobs:run -w backend` from a scheduler every minute.

## 1. Database

Full procedure, including backups: [supabase.md](supabase.md).

```bash
DATABASE_URL=... npm run db:migrate
DATABASE_URL=... npm run db:verify
DATABASE_URL=... BOOTSTRAP_ADMIN_EMAIL=owner@wovenwhale.com BOOTSTRAP_ADMIN_PASSWORD='…' npm run db:bootstrap -w backend
DATABASE_URL=... npm run catalog:import -- --csv=wc-product-export.csv --apply
```

Never run `db:seed` or `db:reset` outside development (both refuse).

## 2. API

```bash
npm ci
npm run build -w backend          # esbuild → backend/dist/server.js
NODE_ENV=production node backend/dist/server.js
```

The process validates configuration on boot and exits with a list of every problem. In production it requires, beyond the obvious URLs and database:

| Variable | Why |
| --- | --- |
| `SESSION_SECRET` | 48 random bytes, unique per environment |
| `MFA_ENCRYPTION_KEY` | 48 random bytes, different from `SESSION_SECRET`; never rotate in place |
| `ADMIN_MFA_REQUIRED=true` | Admins must use 2FA |
| `CLIENT_IP_HEADER` or `TRUSTED_PROXY_HOPS` | Real client IPs for rate limiting (below) |
| `PAYMENT_PROVIDER=razorpay` + `RAZORPAY_*` | Real payments |
| `OTP_PROVIDER=twilio` + `TWILIO_*` | Real OTP |
| `SITE_URL`, `ALLOWED_ORIGINS` over `https://` | CSRF origin check |
| `RATE_LIMIT_MULTIPLIER=1` | No relaxed limits |

Generate secrets with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.

- Health check: `GET /api/health` (checks the database; reveals nothing else).
- Graceful shutdown on `SIGTERM`: stops the scheduler, closes the server and drains the pool.
- Run exactly **one** instance with the in-process scheduler, or several with `DISABLE_SCHEDULER=true` plus an external scheduler, and back rate limits with Redis.
- Local uploads (`STORAGE_PROVIDER=local`) aren't suitable for multi-instance or ephemeral hosts; use `STORAGE_PROVIDER=supabase`.
- Keep the API off the public internet where your host allows (private networking, or an allow-list for the storefront's egress). Customers only ever talk to the storefront domain.

### Client IP for rate limiting

Clients can put anything in `X-Forwarded-For`, and Next.js passes the header through unchanged when self-hosted. So the API only believes forwarding headers you declare:

| Your setup | Setting |
| --- | --- |
| Cloudflare in front | `CLIENT_IP_HEADER=cf-connecting-ip` |
| Vercel storefront → API | `CLIENT_IP_HEADER=x-real-ip`, then verify (below) |
| Your own nginx/ALB in front of the storefront, which appends to `X-Forwarded-For` | `TRUSTED_PROXY_HOPS=1` (one per proxy you run) |

Verify in staging: sign in to the storefront twice from two different networks and confirm the API logs (or a temporary debug line) show two different addresses. If every request shows the same address, all customers share one rate-limit bucket.

## 3. Storefront

On Vercel:

1. Import the repository and set the root directory to `frontend`.
2. Set environment variables: `BACKEND_URL` (the API's URL), `SITE_URL`, `ADMIN_PORTAL_TRIGGER`, `SUPPORT_*`, and `SUPABASE_URL` if images are served from Supabase Storage. Server secrets (session, MFA, provider, database) belong to the API, not the storefront.
3. Build command `npm run build`.

`next.config.ts` rewrites `/api/*` to `BACKEND_URL`, so the browser only talks to the storefront domain and cookies stay first-party.

## 4. Webhooks

Register these once the provider is configured (URLs use the storefront domain; `/api/*` is forwarded to the API):

| Provider | URL | Secret |
| --- | --- | --- |
| Razorpay | `https://<domain>/api/webhooks/payments/razorpay` | `RAZORPAY_WEBHOOK_SECRET` |
| Shipping (manual/generic) | `https://<domain>/api/webhooks/shipping/manual` | `SHIPPING_WEBHOOK_SECRET` |
| WhatsApp | `https://<domain>/api/webhooks/whatsapp` | `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` |

Webhook routes skip the browser-origin check and rely on signatures over the raw body instead.

## 5. First production sign-in

1. Sign in at `https://<domain>/admin/login` with the bootstrap account.
2. You're taken to **Set up two-factor authentication**: scan the QR code, enter a code, save the recovery codes in your password manager.
3. Create the other admins with the least-privileged role that fits; each enrols in 2FA at first sign-in.

## Demo deployment

A public demo with simulated payments and a fixed OTP (see [demo.md](demo.md)). Architecture: **Vercel** (storefront) → `/api/*` rewrite → **Render** (API, Docker, free plan) → **Supabase** (Postgres). The browser only ever talks to the Vercel domain, so cookies are first-party and there is no CORS.

What you need: a Supabase account, a Render account connected to a Git host with this repository, and a Vercel account. The free plans of all three are enough; Render's free API sleeps after 15 minutes idle and takes about a minute to wake.

1. **Database.** Create a Supabase project `wovenwhale-demo` (region Mumbai). From **Connect**, copy the **Session pooler** URI (port 5432).
2. **Secrets.** `cp .env.demo.example .env.demo` and fill it in: the database URI, three generated secrets and a generated `DEMO_TOTP_SECRET`. Pick the Vercel project name now so `SITE_URL` is known (for example `https://wovenwhale-demo.vercel.app`).
3. **Schema and data** (from your machine):

   ```bash
   npm run demo:migrate
   npm run demo:verify        # migrations, RLS, no Supabase API-role grants
   npm run demo:seed          # catalog, demo stock/orders, demo accounts with 2FA
   ```

4. **API on Render.** Push the repository to GitHub, then Render → **New → Blueprint** → the repository. It reads [`render.yaml`](../render.yaml). Paste `DATABASE_URL`, `SESSION_SECRET`, `MFA_ENCRYPTION_KEY`, `MOCK_PAYMENT_WEBHOOK_SECRET`, `SITE_URL` and `ALLOWED_ORIGINS` from `.env.demo`. Wait for the deploy, then open `https://<service>.onrender.com/api/health` → `{"status":"ok"}`.

   No Git host? Any Docker host works with the same image: `docker build -f backend/Dockerfile -t wovenwhale-api .` and run it with the same variables (Railway: `railway up` from the repository root; Fly.io: `fly launch --dockerfile backend/Dockerfile`).

5. **Storefront on Vercel.**

   The API must be up first: the storefront pre-renders the homepage from it during the build. Run these from the **repository root** (the storefront imports shared contracts from `backend/`, so the whole workspace is uploaded):

   ```bash
   npx vercel login
   npx vercel link                  # new project, e.g. wovenwhale-demo; "code located in": ./frontend
   npx vercel env add BACKEND_URL production           # https://<service>.onrender.com
   npx vercel env add SITE_URL production              # https://wovenwhale-demo.vercel.app
   npx vercel env add ADMIN_PORTAL_TRIGGER production  # 7391
   npx vercel deploy --prod
   ```

   Or import the repository in the Vercel dashboard with **Root Directory = `frontend`** and the same variables.

6. **Check it.** Open the storefront: the demo banner shows, products load, sign in with `70000 99999` / `123456`, place a COD and a prepaid order, sign in to `/admin` as `orders@wovenwhale.local` with the 2FA code, approve the COD order. Then, as `owner@…`, open `https://<vercel-domain>/api/admin/diagnostics/request`: `clientIp` must be your own public IP. If it shows a Vercel or Render address instead, adjust `TRUSTED_PROXY_HOPS` on Render (the `x-forwarded-for` list shows how many entries follow yours).

**Razorpay test mode instead of the simulated gateway:** set `PAYMENT_PROVIDER=razorpay` and the `rzp_test_` keys on Render, and add the webhook `https://<vercel-domain>/api/webhooks/payments/razorpay` in the Razorpay dashboard (test mode). `DEMO_MODE` accepts test keys and refuses live ones.

**Background jobs** run inside the API process (it's long-running on Render), except while the free instance is asleep; they catch up when it wakes.

**Reset:** `npm run demo:reset -- --confirm=<database host>`.

## Releasing schema changes

1. `npm run db:generate` locally, review the SQL, commit.
2. Deploy: back up (production), run `npm run db:migrate` **before** starting the new API version, then `npm run db:verify`.
3. Write migrations to be backward compatible with the currently running version (add, backfill, then tighten in a later release).

## Rollback

- Storefront: redeploy the previous build (instant on Vercel).
- API: redeploy the previous image. Migrations are additive, so the previous version keeps working against the newer schema.
- Data: Supabase point-in-time recovery or the pre-migration dump ([supabase.md](supabase.md#5-backups-and-recovery)).

See the production checklist in the [README](../README.md#production-checklist).
