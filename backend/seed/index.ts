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

if (process.env.NODE_ENV === "production" && process.env.DEMO_MODE !== "true") {
  console.error("✗ The development seed must not run in production. Use `npm run db:bootstrap` (a DEMO_MODE deployment may be seeded).");
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

const { seedDemoAdmins, seedDemoCustomer, DEMO_CUSTOMER_PHONE } = await import("./demo-accounts");
const demoAdmins = await seedDemoAdmins(email);
console.log(`✓ Demo admins, one per role${demoAdmins.mfa ? " (2FA pre-enrolled with DEMO_TOTP_SECRET)" : ""}`);
const demoCustomer = await seedDemoCustomer();
console.log(
  demoCustomer.created
    ? `✓ Demo customer ${DEMO_CUSTOMER_PHONE} with delivered, paid and COD orders`
    : "• Demo customer already present — skipped",
);

await sqlClient.end();
console.log("✓ Seed complete");
