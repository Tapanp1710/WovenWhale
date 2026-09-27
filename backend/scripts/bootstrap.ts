/**
 * Production-safe bootstrap (idempotent): permissions, roles, WhatsApp
 * template placeholders and — only if none exists — the first super-admin.
 *
 *   BOOTSTRAP_ADMIN_EMAIL=owner@wovenwhale.com BOOTSTRAP_ADMIN_PASSWORD='…' npm run db:bootstrap -w backend
 */
import { strongPasswordSchema } from "../src/contracts/admin";
import { sqlClient } from "../src/db/client";
import { bootstrapReferenceData, ensureSuperAdmin } from "../src/modules/admin/rbac";

await bootstrapReferenceData();
console.log("✓ Reference data ready (permissions, roles, templates)");

const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
if (email && password) {
  strongPasswordSchema.parse(password);
  const { created } = await ensureSuperAdmin(email, password);
  console.log(created ? `✓ Super-admin ${email} created` : "• A super-admin already exists — skipped");
}
await sqlClient.end();
