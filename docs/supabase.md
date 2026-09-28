# Supabase

WovenWhale uses Supabase only as managed PostgreSQL (and, optionally, Storage for product images). All data access goes through the commerce API; Supabase's auto-generated Data API is locked out by Row Level Security with no policies and by revoking every privilege from its `anon` and `authenticated` roles.

## Environments

Keep one Supabase project per environment. Never share a database between them.

| Environment | Database | Data | Who connects |
| --- | --- | --- | --- |
| **Development** | Local Docker Postgres (`npm run db:up`) or a dedicated Supabase **development** project | Seed data: real catalog + clearly fake demo activity | Developers, the MCP server (read-only) |
| **Staging** | Supabase **staging** project | Official catalog export, test customers, Razorpay **test** keys | CI, the staging API |
| **Production** | Supabase **production** project | Real data only; never seeded | The production API only |

## 1. Create the development project

1. In the [Supabase dashboard](https://supabase.com/dashboard), create a project named for example `wovenwhale-dev` in the Mumbai (`ap-south-1`) region, closest to Indian customers.
2. Save the database password in your password manager.
3. Note the **project ref** (the `abcd…` part of `https://abcd….supabase.co`).
4. Under **Connect**, copy two connection strings:
   - **Transaction pooler** (port `6543`): the API's `DATABASE_URL`. Add `?sslmode=require`. The client already uses `prepare: false`, which transaction pooling needs.
   - **Session pooler** (port `5432`) or the direct connection: use it for migrations if the transaction pooler rejects a statement.

Put the development values in your local `.env` (never commit it):

```bash
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require
DATABASE_POOL_MAX=5
```

## 2. Apply migrations and verify

The SQL files in [`backend/drizzle/`](../backend/drizzle) are the only source of truth. Don't create or alter tables in the dashboard.

```bash
npm run db:migrate          # applies pending migrations, tracked in drizzle.__drizzle_migrations
npm run db:verify           # read-only: migrations applied, RLS on every table, no anon/authenticated grants
npm run db:seed             # DEVELOPMENT ONLY: catalog + demo data (refuses when NODE_ENV=production)
```

For staging and production, skip `db:seed` and create the first super admin instead:

```bash
BOOTSTRAP_ADMIN_EMAIL=owner@wovenwhale.com BOOTSTRAP_ADMIN_PASSWORD='<strong, unique>' npm run db:bootstrap -w backend
```

`db:verify` prints each check and exits non-zero on a problem, so it can run in CI after every deploy.

Compatibility has been tested locally against Postgres 16 configured with Supabase's `anon` and `authenticated` roles and default privileges: all migrations apply from scratch, the API roles end up with no privileges, and tables created afterwards receive none. The migrations use only standard PostgreSQL (`gen_random_uuid()` is built in from Postgres 13), so no extensions need enabling.

## 3. Connect the Supabase MCP server (development only)

[`.mcp.json`](../.mcp.json) configures Supabase's hosted MCP server for Claude Code:

```json
"url": "https://mcp.supabase.com/mcp?project_ref=${SUPABASE_DEV_PROJECT_REF}&read_only=true&features=database,docs,debugging"
```

- `project_ref` scopes it to the one development project, so it can't see staging or production.
- `read_only=true` runs every query as a read-only role. Schema changes go through migrations, not the MCP server.
- `features` exposes only database inspection, docs and logs/advisors.

To use it:

1. Set the ref in your shell before starting Claude Code: `export SUPABASE_DEV_PROJECT_REF=<dev ref>` (PowerShell: `$env:SUPABASE_DEV_PROJECT_REF="<dev ref>"`).
2. Start Claude Code and run `/mcp`. Choose **supabase** and sign in to Supabase in the browser (OAuth). No access token is stored in the repository.
3. Useful checks: list tables, run the **security advisor** (should report RLS enabled everywhere), and compare the schema with `backend/drizzle`.

Never point the MCP server at production.

## 4. Storage (optional)

To store uploaded product images in Supabase instead of on the API's disk (required for multi-instance or ephemeral hosts):

1. Create a **public** bucket, for example `product-images`.
2. Set `STORAGE_PROVIDER=supabase`, `SUPABASE_URL`, `SUPABASE_STORAGE_BUCKET` and `SUPABASE_SERVICE_ROLE_KEY` on the **API** only.

The service-role key bypasses RLS. It belongs only in the API's server environment, never in the storefront, never with a `NEXT_PUBLIC_` prefix, never in logs.

## 5. Backups and recovery

- **Production:** enable **Point-in-Time Recovery** (Pro plan add-on) so the database can be restored to any second in the retention window. Daily backups alone can lose up to a day of orders.
- **Before every production migration:** take a logical backup:

  ```bash
  pg_dump "$DIRECT_URL" --format=custom --no-owner --file=wovenwhale-$(date +%Y%m%d-%H%M).dump
  ```

- **Restore drill** (do this once before launch, then quarterly): restore the latest backup into a fresh **staging** project, run `npm run db:verify`, and sign in to the admin.

  ```bash
  pg_restore --dbname "$STAGING_DIRECT_URL" --no-owner --clean --if-exists wovenwhale-YYYYMMDD-HHMM.dump
  ```

- Store dumps encrypted and outside Supabase (they contain customer phone numbers and addresses).
- Migrations are additive, so rolling back the API never needs a database restore; restore only for data loss.

## 6. Resetting a database

| Environment | How |
| --- | --- |
| Local Docker | `npm run db:reset` (drops everything, migrates, seeds) |
| Supabase development | Create a fresh development project (or pause and delete the old one), update `DATABASE_URL` and `SUPABASE_DEV_PROJECT_REF`, then `db:migrate`, `db:verify`, `db:seed` |
| Staging | Restore from a production backup (above), never a seed |
| Production | Never. Restore from backup only after an incident review |

`db:reset` refuses to run against anything except a `localhost` database, and never when `NODE_ENV=production`, so it can't touch a Supabase project by accident.
