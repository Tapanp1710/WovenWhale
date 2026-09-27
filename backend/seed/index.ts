/**
 * DEVELOPMENT SEED. Never run against production.
 *
 * Real: product catalog (from wovenwhale.com snapshot), RBAC reference data.
 * DEMO (clearly fake): stock levels, merchandising flags, customers, orders,
 * coupons, checkout sessions and analytics events.
 */
import { sqlClient } from "../src/db/client";
import { bootstrapReferenceData, ensureSuperAdmin } from "../src/modules/admin/rbac";
import { seedCatalog } from "./catalog";
import { createRandom } from "./random";

if (process.env.NODE_ENV === "production") {
  console.error("✗ The development seed must not run in production. Use `npm run db:bootstrap`.");
  process.exit(1);
}

const random = createRandom();

await bootstrapReferenceData();
console.log("✓ Roles, permissions and WhatsApp template placeholders");

const email = process.env.SEED_SUPER_ADMIN_EMAIL ?? "owner@wovenwhale.local";
const password = process.env.SEED_SUPER_ADMIN_PASSWORD ?? "ChangeMe!2026";
await ensureSuperAdmin(email, password);
console.log(`✓ Super-admin: ${email}`);

const catalog = await seedCatalog(random);
console.log("✓ Catalog", catalog);

const { seedDemoActivity } = await import("./activity");
await seedDemoActivity(random);

await sqlClient.end();
console.log("✓ Seed complete");
