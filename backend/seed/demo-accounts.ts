/**
 * DEMO ONLY — named accounts for walking through the platform.
 *
 * - One admin per role, sharing a demo password. On a demo deployment
 *   (DEMO_MODE=true with ADMIN_MFA_REQUIRED=true) they are pre-enrolled in 2FA;
 *   with ADMIN_MFA_REQUIRED=false they sign in with the password alone
 *   with DEMO_TOTP_SECRET, so a presenter can add that one key to an
 *   authenticator app and sign in as any role.
 * - One demo customer with orders ready for each step of the demo: a
 *   delivered order inside the return window, a paid order inside the
 *   cancellation window and a COD order waiting for approval. All created
 *   through the real services, never inserted directly.
 *
 * These credentials are public by design. Never seed them into a real store.
 */
import { eq } from "drizzle-orm";
import type { AdminContext } from "../src/app-env";
import { PERMISSIONS, type AdminRole, type PaymentMethod } from "../src/contracts/enums";
import { db } from "../src/db/client";
import { addresses, adminUsers, customerProfiles, orders, roles, users } from "../src/db/schema";
import { mfaKey } from "../src/config/env";
import { hashPassword } from "../src/lib/crypto";
import { base32Decode, encryptSecret } from "../src/lib/totp";
import { addItem } from "../src/modules/cart/service";
import { getQuote, placeOrder, startCheckout } from "../src/modules/checkout/service";
import { transitionOrder } from "../src/modules/orders/lifecycle";
import { createShipment } from "../src/modules/shipping/service";
import { completePrepaidPayment, inStockVariants } from "./activity";

export const DEMO_ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD ?? "Demo-Only-2026!";
export const DEMO_CUSTOMER_PHONE = "+917000099999";

const DEMO_ADMINS: { email: string; fullName: string; role: AdminRole }[] = [
  { email: "admin@wovenwhale.local", fullName: "Demo Admin", role: "ADMIN" },
  { email: "orders@wovenwhale.local", fullName: "Demo Order Manager", role: "ORDER_MANAGER" },
  { email: "inventory@wovenwhale.local", fullName: "Demo Inventory Manager", role: "INVENTORY_MANAGER" },
  { email: "support@wovenwhale.local", fullName: "Demo Support Agent", role: "SUPPORT" },
];

/** Only a labelled demo deployment gets pre-enrolled 2FA; local development keeps 2FA optional. */
function demoTotpSecret(): string | null {
  if (process.env.DEMO_MODE !== "true" || process.env.ADMIN_MFA_REQUIRED !== "true") return null;
  const secret = process.env.DEMO_TOTP_SECRET?.trim().toUpperCase() ?? "";
  if (!secret) throw new Error("DEMO_MODE seeding needs DEMO_TOTP_SECRET (see docs/demo.md)");
  if (base32Decode(secret).length < 10) throw new Error("DEMO_TOTP_SECRET must be base32 with at least 16 characters");
  return secret;
}

export async function seedDemoAdmins(superAdminEmail: string) {
  const roleRows = await db.select().from(roles);
  const roleId = new Map(roleRows.map((r) => [r.key, r.id]));
  const passwordHash = await hashPassword(DEMO_ADMIN_PASSWORD);
  for (const a of DEMO_ADMINS) {
    await db
      .insert(adminUsers)
      .values({ email: a.email, fullName: a.fullName, passwordHash, roleId: roleId.get(a.role)! })
      .onConflictDoNothing();
  }

  const secret = demoTotpSecret();
  if (secret) {
    const emails = [superAdminEmail.toLowerCase(), ...DEMO_ADMINS.map((a) => a.email)];
    for (const email of emails) {
      await db
        .update(adminUsers)
        .set({ totpSecret: encryptSecret(secret, mfaKey), totpEnabledAt: new Date(), totpLastStep: null })
        .where(eq(adminUsers.email, email));
    }
  }
  return { admins: DEMO_ADMINS.length, mfa: Boolean(secret) };
}

export async function seedDemoCustomer() {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.phone, DEMO_CUSTOMER_PHONE));
  if (existing) return { created: false };

  const [user] = await db
    .insert(users)
    .values({ phone: DEMO_CUSTOMER_PHONE, fullName: "Demo Customer", email: "demo.customer@example.com", phoneVerifiedAt: new Date() })
    .returning();
  await db.insert(customerProfiles).values({ userId: user!.id, acquisitionSource: "direct", whatsappOptIn: true });
  const [home] = await db
    .insert(addresses)
    .values({
      userId: user!.id,
      addressType: "HOME",
      fullName: "Demo Customer",
      phone: DEMO_CUSTOMER_PHONE,
      line1: "Flat 12B, Palm Grove Apartments",
      line2: "4th Cross Road",
      area: "Koramangala",
      city: "Bengaluru",
      state: "Karnataka",
      pincode: "560034",
      isDefault: true,
    })
    .returning();
  await db.insert(addresses).values({
    userId: user!.id,
    addressType: "WORK",
    fullName: "Demo Customer",
    phone: DEMO_CUSTOMER_PHONE,
    line1: "3rd Floor, Indigo Tech Park",
    line2: "Outer Ring Road",
    area: "Bellandur",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560103",
    isDefault: false,
  });

  const [owner] = await db.select().from(adminUsers).limit(1);
  const admin: AdminContext = {
    id: owner!.id,
    email: owner!.email,
    fullName: owner!.fullName,
    role: "SUPER_ADMIN",
    permissions: new Set(PERMISSIONS),
    sessionId: "demo-seed",
  };
  const actor = { type: "ADMIN" as const, id: admin.id, permissions: admin.permissions };
  const variants = await inStockVariants();

  const order = async (method: PaymentMethod, key: string, variantIndex: number) => {
    await addItem({ userId: user!.id }, variants[variantIndex % variants.length]!.id, 1, null);
    await startCheckout(user!.id, null);
    const quote = await getQuote(user!.id, method);
    const placed = await placeOrder(
      user!.id,
      { addressId: home!.id, paymentMethod: method, idempotencyKey: `demo-${key}`, expectedTotalPaise: quote.totals.totalPaise },
      { visitorId: null, accountPhone: DEMO_CUSTOMER_PHONE },
    );
    const [row] = await db.select().from(orders).where(eq(orders.orderNumber, placed.orderNumber));
    return row!;
  };

  // 1. Delivered today: eligible for a return for 14 days.
  const delivered = await order("PREPAID", "delivered", 0);
  await completePrepaidPayment(delivered.orderNumber, true);
  await db.transaction((tx) => transitionOrder(tx, delivered.id, "PROCESSING", actor));
  await db.transaction((tx) => transitionOrder(tx, delivered.id, "PACKED", actor));
  await createShipment(admin, delivered.id, { courierName: "Delhivery", awb: `DEMO${Date.now()}`, trackingUrl: null });
  await db.transaction((tx) => transitionOrder(tx, delivered.id, "DELIVERED", actor));

  // 2. Paid just now: can be cancelled for 12 hours.
  const paid = await order("PREPAID", "paid-now", 7);
  await completePrepaidPayment(paid.orderNumber, true);

  // 3. Cash on delivery: waiting in the admin approval queue.
  await order("COD", "cod-pending", 13);
  return { created: true };
}
