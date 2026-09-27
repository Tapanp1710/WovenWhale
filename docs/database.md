# Database

PostgreSQL 15+ (Supabase in production, Docker locally). Schema is defined in TypeScript with Drizzle in [`backend/src/db/schema/`](../backend/src/db/schema) and shipped as SQL migrations in [`backend/drizzle/`](../backend/drizzle).

## Conventions

- **Money** is `integer` paise (₹1 = 100). No floating point anywhere in pricing.
- **IDs** are UUIDs. Customer-facing references are short, unambiguous codes: `WW…` for orders, `RT…` for returns.
- **Timestamps** are `timestamptz`. `updated_at` is maintained by the ORM.
- **Soft deletion** (`deleted_at`) for users, addresses and products, which history keeps referencing.
- **Snapshots** where history must not change: orders store the delivery address as JSON and every line stores name, SKU, size, image and prices at the time of purchase.
- **Status columns** are Postgres enums generated from [`contracts/enums.ts`](../backend/src/contracts/enums.ts), the single source of lifecycle states.

## Tables by area

| Area | Tables |
| --- | --- |
| Identity | `users`, `customer_profiles`, `addresses`, `otp_challenges`, `sessions` |
| Admin and RBAC | `admin_users`, `roles`, `permissions`, `role_permissions`, `audit_logs`, `store_settings` |
| Catalog | `categories`, `products`, `product_categories`, `product_variants`, `product_images` |
| Inventory | `inventory` (one row per variant), `inventory_transactions` (append-only journal) |
| Shopping | `carts`, `cart_items`, `checkout_sessions`, `wishlists`, `wishlist_items` |
| Coupons | `coupons`, `coupon_products`, `coupon_categories`, `coupon_usage` |
| Orders | `orders`, `order_items`, `order_status_history`, `order_notes` |
| Payments | `payments`, `payment_events` |
| Shipping | `shipments`, `shipment_events` |
| After-sales | `returns`, `return_items`, `refunds` |
| Engagement | `customer_events`, `notifications`, `whatsapp_conversations`, `whatsapp_messages`, `whatsapp_templates`, `newsletter_subscribers`, `support_requests` |

## Integrity guarantees in the schema

| Constraint | Purpose |
| --- | --- |
| `products_sku_uq`, `product_variants_sku_uq` | SKUs are unique |
| `product_variants (product_id, size, color) UNIQUE NULLS NOT DISTINCT` | One variant per size/colour |
| `products_price_ck` | Price > 0 and MRP ≥ price |
| `products.discount_percent` (generated) | Discount filtering and sorting in SQL |
| `inventory_non_negative_ck`, `inventory_reserved_le_on_hand_ck` | Stock can never go negative or be over-reserved |
| `coupons_code_uq` on `upper(code)` | Case-insensitive unique codes |
| `coupons_usage_ck` | `used_count ≤ usage_limit` |
| `coupon_usage (order_id, coupon_id)` unique | One redemption per coupon per order |
| `orders_number_uq`, `orders_user_idempotency_uq` | Unique order numbers; idempotent placement |
| `orders_total_ck` | `total = subtotal − discount + shipping + cod_fee`, total ≥ 0 |
| `order_items_total_ck` | Line total = line subtotal − allocated discount |
| `payments (provider, provider_order_id)`, `(provider, provider_payment_id)` unique | Gateway references can't be recorded twice |
| `payment_events (provider, provider_event_id)` unique | Webhook idempotency |
| `shipments_awb_uq` | An AWB belongs to one shipment |
| `refunds_amount_ck`, `refunds_provider_uq` | Positive amounts; gateway refund ids unique |
| `addresses_one_default_uq` (partial) | At most one default address per customer |
| `carts_user_uq`, `carts_guest_uq` (partial) | One cart per customer or guest token |

## Row Level Security

Migration `0001_enable_rls` enables RLS on every table without policies and revokes table privileges from Supabase's `anon` and `authenticated` roles. The API connects with the database owner role and isn't affected; Supabase's auto-generated REST and GraphQL endpoints can read or write nothing. Migration `0002` does the same for tables it adds. Any future table needs the same treatment (see [security.md](security.md)).

## Migrations

```bash
# change files in backend/src/db/schema, then:
npm run db:generate          # writes backend/drizzle/NNNN_name.sql
npm run db:migrate           # applies pending migrations (tracked in drizzle.__drizzle_migrations)
```

- Review generated SQL before committing. Never edit an applied migration; add a new one.
- Custom SQL (RLS, data backfills) goes in a custom migration: `npx drizzle-kit generate --custom --name <name>` in `backend/`.
- Every migration must be safe to run on a live database: add nullable columns or defaults first, backfill, then tighten.

## Useful queries

```sql
-- Stock that can be sold right now
select p.name, v.size, i.on_hand - i.reserved as available
from inventory i join product_variants v on v.id = i.variant_id join products p on p.id = v.product_id
order by available;

-- Reconcile a variant's stock from its journal
select sum(on_hand_delta) as on_hand, sum(reserved_delta) as reserved
from inventory_transactions where variant_id = $1;

-- COD orders waiting for approval, oldest first
select order_number, total_paise, placed_at, risk_flags from orders
where status = 'PENDING_COD_APPROVAL' order by placed_at;
```
