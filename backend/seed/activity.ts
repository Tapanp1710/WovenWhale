/**
 * DEV SEED — DEMO ACTIVITY (clearly fake).
 *
 * Demo customers use the reserved phone range +91 70000 0xxxx and
 * @example.com emails. Orders are created through the real services
 * (cart → placeOrder → payment events → transitionOrder) so every invariant
 * holds — stock ledger, coupon usage, status history — then backdated.
 * Behavioural events carry `metadata.seed = true`.
 */
import { and, eq, sql } from "drizzle-orm";
import type { AdminContext } from "../src/app-env";
import { PERMISSIONS, type PaymentMethod } from "../src/contracts/enums";
import { db } from "../src/db/client";
import {
  addresses,
  adminUsers,
  orderItems,
  checkoutSessions,
  couponCategories,
  coupons,
  customerEvents,
  customerProfiles,
  inventory,
  inventoryTransactions,
  orderStatusHistory,
  orders,
  paymentEvents,
  payments,
  productVariants,
  products,
  categories,
  refunds,
  returns,
  shipmentEvents,
  shipments,
  users,
} from "../src/db/schema";
import { providers } from "../src/integrations";
import { MOCK_SIGNATURE_HEADER, MockPaymentProvider } from "../src/integrations/payments/mock";
import { addItem } from "../src/modules/cart/service";
import { getQuote, placeOrder, startCheckout } from "../src/modules/checkout/service";
import { transitionOrder } from "../src/modules/orders/lifecycle";
import { handleVerifiedPaymentEvent } from "../src/modules/payments/service";
import { createReturn } from "../src/modules/returns/service";
import { createShipment } from "../src/modules/shipping/service";
import type { Random } from "./random";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

const FIRST = [
  "Aarav",
  "Vivaan",
  "Aditya",
  "Arjun",
  "Sai",
  "Reyansh",
  "Krishna",
  "Ishaan",
  "Rohan",
  "Kabir",
  "Anand",
  "Nikhil",
  "Rahul",
  "Karthik",
  "Varun",
  "Siddharth",
  "Pranav",
  "Harsh",
  "Manish",
  "Deepak",
];
const LAST = [
  "Sharma",
  "Reddy",
  "Iyer",
  "Nair",
  "Rao",
  "Patel",
  "Menon",
  "Gupta",
  "Das",
  "Mukherjee",
  "Kulkarni",
  "Joshi",
  "Pillai",
  "Bose",
  "Verma",
];
const CITIES: [string, string, string][] = [
  ["Bengaluru", "Karnataka", "560038"],
  ["Hyderabad", "Telangana", "500033"],
  ["Chennai", "Tamil Nadu", "600017"],
  ["Mumbai", "Maharashtra", "400050"],
  ["Pune", "Maharashtra", "411001"],
  ["New Delhi", "Delhi", "110016"],
  ["Kolkata", "West Bengal", "700019"],
  ["Kochi", "Kerala", "682020"],
  ["Ahmedabad", "Gujarat", "380009"],
  ["Jaipur", "Rajasthan", "302001"],
];
const SOURCES = ["instagram", "google", "direct", "whatsapp", "referral", "facebook"];
const SEARCHES = ["ikat", "jamdani", "kurta", "linen shirt", "kalamkari", "white shirt", "blue", "handloom", "mandarin collar", "festive"];

const SEED_ADMIN: AdminContext = {
  id: "",
  email: "seed@wovenwhale.local",
  fullName: "Seed",
  role: "SUPER_ADMIN",
  permissions: new Set(PERMISSIONS),
  sessionId: "seed",
};

/** Shifts every timestamp produced for one order into the past by `deltaMs`. */
async function backdateOrder(orderId: string, userId: string, since: Date, deltaMs: number) {
  const d = sql.raw(`interval '${Math.round(deltaMs / 1000)} seconds'`);
  await db.execute(sql`update ${orders} set placed_at = placed_at + ${d}, created_at = created_at + ${d},
    cancel_deadline_at = cancel_deadline_at + ${d}, payment_expires_at = payment_expires_at + ${d},
    confirmed_at = confirmed_at + ${d}, delivered_at = delivered_at + ${d}, return_deadline_at = return_deadline_at + ${d},
    cancelled_at = cancelled_at + ${d} where id = ${orderId}`);
  await db.execute(sql`update ${orderStatusHistory} set created_at = created_at + ${d} where order_id = ${orderId}`);
  await db.execute(
    sql`update ${payments} set created_at = created_at + ${d}, verified_at = verified_at + ${d} where order_id = ${orderId}`,
  );
  await db.execute(sql`update ${paymentEvents} set created_at = created_at + ${d}, processed_at = processed_at + ${d}
    where payment_id in (select id from ${payments} where order_id = ${orderId})`);
  await db.execute(sql`update ${inventoryTransactions} set created_at = created_at + ${d} where order_id = ${orderId}`);
  await db.execute(
    sql`update ${shipments} set created_at = created_at + ${d}, shipped_at = shipped_at + ${d}, delivered_at = delivered_at + ${d} where order_id = ${orderId}`,
  );
  await db.execute(sql`update ${shipmentEvents} set occurred_at = occurred_at + ${d}, created_at = created_at + ${d}
    where shipment_id in (select id from ${shipments} where order_id = ${orderId})`);
  await db.execute(
    sql`update ${refunds} set created_at = created_at + ${d}, processed_at = processed_at + ${d} where order_id = ${orderId}`,
  );
  await db.execute(sql`update ${returns} set created_at = created_at + ${d} where order_id = ${orderId}`);
  await db.execute(
    sql`update ${customerEvents} set created_at = created_at + ${d} where user_id = ${userId} and created_at >= ${since.toISOString()}::timestamptz`,
  );
  await db.execute(sql`update ${checkoutSessions} set created_at = created_at + ${d}, last_activity_at = last_activity_at + ${d}
    where user_id = ${userId} and created_at >= ${since.toISOString()}::timestamptz`);
}

async function seedCoupons() {
  const [weaves] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, "jamdani"));
  const [ikat] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, "ikat"));
  const now = Date.now();
  const rows = [
    {
      code: "WELCOME10",
      description: "DEMO — 10% off your first order (max ₹300)",
      type: "PERCENTAGE" as const,
      value: 10,
      maxDiscountPaise: 30000,
      minOrderPaise: 99900,
      firstOrderOnly: true,
      perCustomerLimit: 1,
    },
    {
      code: "HANDLOOM15",
      description: "DEMO — 15% off Ikat & Jamdani over ₹1,999",
      type: "PERCENTAGE" as const,
      value: 15,
      minOrderPaise: 199900,
      maxDiscountPaise: 60000,
      usageLimit: 200,
    },
    {
      code: "FLAT200",
      description: "DEMO — ₹200 off orders over ₹1,499 (stackable)",
      type: "FIXED_AMOUNT" as const,
      value: 20000,
      minOrderPaise: 149900,
      isStackable: true,
    },
    {
      code: "MONSOON25",
      description: "DEMO — expired seasonal offer",
      type: "PERCENTAGE" as const,
      value: 25,
      startsAt: new Date(now - 90 * DAY),
      endsAt: new Date(now - 30 * DAY),
    },
  ];
  for (const row of rows) {
    const [coupon] = await db.insert(coupons).values(row).onConflictDoNothing().returning({ id: coupons.id });
    if (coupon && row.code === "HANDLOOM15") {
      await db.insert(couponCategories).values([weaves, ikat].filter(Boolean).map((c) => ({ couponId: coupon.id, categoryId: c!.id })));
    }
  }
}

async function createCustomer(random: Random, i: number, createdAt: Date) {
  const first = random.pick(FIRST);
  const last = random.pick(LAST);
  const phone = `+9170000${String(10000 + i).slice(-5)}`;
  const [city, state, pincode] = random.pick(CITIES);
  const [user] = await db
    .insert(users)
    .values({
      phone,
      fullName: `${first} ${last}`,
      email: `${first}.${last}${i}@example.com`.toLowerCase(),
      phoneVerifiedAt: createdAt,
      createdAt,
    })
    .onConflictDoNothing()
    .returning();
  if (!user) return null;
  await db
    .insert(customerProfiles)
    .values({ userId: user.id, acquisitionSource: random.pick(SOURCES), whatsappOptIn: random.chance(0.6), createdAt });
  const [address] = await db
    .insert(addresses)
    .values({
      userId: user.id,
      fullName: `${first} ${last}`,
      phone,
      email: user.email,
      line1: `${random.int(1, 400)}, ${random.pick(["Lakeview Residency", "Palm Grove", "Sunrise Towers", "Green Park Apartments"])}`,
      line2: `${random.int(1, 18)}th Main Road`,
      area: random.pick([
        "Indiranagar",
        "Jubilee Hills",
        "T Nagar",
        "Bandra West",
        "Koregaon Park",
        "Hauz Khas",
        "Salt Lake",
        "Kadavanthra",
      ]),
      city,
      state,
      pincode,
      isDefault: true,
      createdAt,
    })
    .returning();
  return { user, address: address! };
}

async function completePrepaidPayment(orderNumber: string, succeed: boolean) {
  const gateway = providers.payments as MockPaymentProvider;
  const [row] = await db
    .select({ providerOrderId: payments.providerOrderId, amount: payments.amountPaise })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(eq(orders.orderNumber, orderNumber));
  if (!row?.providerOrderId) return;
  const body = JSON.stringify({
    id: `seed_evt_${orderNumber}_${succeed ? "ok" : "fail"}`,
    event: succeed ? "payment.captured" : "payment.failed",
    providerOrderId: row.providerOrderId,
    providerPaymentId: `seed_pay_${orderNumber}`,
    amountPaise: row.amount,
    failureReason: succeed ? null : "Card declined (demo)",
  });
  const event = await gateway.parseWebhook(body, new Headers({ [MOCK_SIGNATURE_HEADER]: gateway.signWebhook(body) }));
  await handleVerifiedPaymentEvent(event);
}

async function inStockVariants() {
  return db
    .select({ id: productVariants.id, productId: productVariants.productId })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(and(eq(products.isActive, true), eq(productVariants.isActive, true), sql`${inventory.onHand} - ${inventory.reserved} > 3`));
}

type Plan = "DELIVERED" | "SHIPPED" | "PROCESSING" | "CONFIRMED" | "PENDING_COD" | "CANCELLED" | "REJECTED" | "RETURNED";

export async function seedDemoActivity(random: Random) {
  const [existing] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(sql`${users.phone} like '+9170000%'`);
  if (Number(existing?.n ?? 0) > 0) {
    console.log("• Demo activity already present — skipped");
    return;
  }
  await seedCoupons();
  const [admin] = await db.select().from(adminUsers).limit(1);
  SEED_ADMIN.id = admin!.id;
  SEED_ADMIN.email = admin!.email;
  const adminActor = { type: "ADMIN" as const, id: SEED_ADMIN.id, permissions: SEED_ADMIN.permissions };

  const now = Date.now();
  const variants = await inStockVariants();
  const customers: NonNullable<Awaited<ReturnType<typeof createCustomer>>>[] = [];
  for (let i = 0; i < 36; i++) {
    const c = await createCustomer(random, i, new Date(now - random.int(1, 75) * DAY));
    if (c) customers.push(c);
  }

  let orderCount = 0;
  for (let i = 0; i < 90; i++) {
    const customer = random.pick(customers);
    const ageDays = i < 4 ? 0 : random.int(1, 60);
    const targetPlacedAt = new Date(now - ageDays * DAY - random.int(0, 20) * HOUR);
    const plan: Plan =
      i < 4
        ? "PENDING_COD"
        : ageDays <= 2
          ? random.pick(["CONFIRMED", "PROCESSING", "SHIPPED"])
          : random.chance(0.08)
            ? "CANCELLED"
            : random.chance(0.05)
              ? "REJECTED"
              : random.chance(0.06) && ageDays <= 20
                ? "RETURNED"
                : ageDays <= 5
                  ? "SHIPPED"
                  : "DELIVERED";
    const method: PaymentMethod = plan === "PENDING_COD" || plan === "REJECTED" ? "COD" : random.chance(0.45) ? "COD" : "PREPAID";

    const since = new Date();
    try {
      const lines = random.int(1, 3);
      for (let l = 0; l < lines; l++) {
        const v = random.pick(variants);
        await addItem({ userId: customer.user.id }, v.id, random.chance(0.15) ? 2 : 1, null).catch(() => undefined);
      }
      await startCheckout(customer.user.id, null);
      const quote = await getQuote(customer.user.id, method);
      const placed = await placeOrder(
        customer.user.id,
        {
          addressId: customer.address.id,
          paymentMethod: method,
          idempotencyKey: `seed-${i}-${customer.user.id.slice(0, 8)}`,
          expectedTotalPaise: quote.totals.totalPaise,
        },
        { visitorId: null, accountPhone: customer.user.phone },
      );
      const [order] = await db.select().from(orders).where(eq(orders.orderNumber, placed.orderNumber));
      const id = order!.id;
      const t = (h: number) => new Date(Date.now() + h * HOUR);

      if (method === "PREPAID") {
        if (random.chance(0.12)) await completePrepaidPayment(placed.orderNumber, false);
        await completePrepaidPayment(placed.orderNumber, true);
      }
      if (plan === "PENDING_COD") {
        // leave for the admin approval queue
      } else if (plan === "REJECTED") {
        await db.transaction((tx) => transitionOrder(tx, id, "REJECTED", adminActor, { note: "Unreachable on phone (demo)", now: t(2) }));
      } else if (plan === "CANCELLED") {
        await db.transaction((tx) =>
          transitionOrder(tx, id, "CANCELLED", { type: "CUSTOMER", id: customer.user.id }, { note: "Changed my mind (demo)", now: t(3) }),
        );
      } else {
        if (method === "COD")
          await db.transaction((tx) => transitionOrder(tx, id, "CONFIRMED", adminActor, { note: "COD approved", now: t(1) }));
        if (plan !== "CONFIRMED") {
          await db.transaction((tx) => transitionOrder(tx, id, "PROCESSING", adminActor, { now: t(5) }));
          if (plan !== "PROCESSING") {
            await db.transaction((tx) => transitionOrder(tx, id, "PACKED", adminActor, { now: t(20) }));
            await createShipment(SEED_ADMIN, id, {
              courierName: random.pick(["Delhivery", "Blue Dart", "Ekart", "DTDC"]),
              awb: `DEMO${String(100000 + i)}`,
              trackingUrl: null,
            });
            if (plan === "DELIVERED" || plan === "RETURNED") {
              await db.transaction((tx) => transitionOrder(tx, id, "OUT_FOR_DELIVERY", adminActor, { now: t(70) }));
              await db.transaction((tx) => transitionOrder(tx, id, "DELIVERED", adminActor, { now: t(76) }));
              if (plan === "RETURNED") {
                const [item] = await db.select().from(orderItems).where(eq(orderItems.orderId, id)).limit(1);
                await createReturn(customer.user.id, placed.orderNumber, {
                  type: "RETURN",
                  reason: random.pick(["SIZE_ISSUE", "QUALITY", "CHANGED_MIND"]),
                  note: "Demo return request",
                  items: [{ orderItemId: item!.id, quantity: 1 }],
                });
              }
            }
          }
        }
      }
      await backdateOrder(id, customer.user.id, since, targetPlacedAt.getTime() - Date.parse(order!.placedAt.toISOString()));
      orderCount++;
    } catch (error) {
      console.warn(`  demo order ${i} skipped: ${(error as Error).message}`);
    }
  }
  console.log(`✓ Demo orders: ${orderCount}`);

  // Two abandoned checkouts for the recovery view.
  for (const customer of customers.slice(0, 2)) {
    await addItem({ userId: customer.user.id }, random.pick(variants).id, 1, null).catch(() => undefined);
    const { checkoutSessionId } = await startCheckout(customer.user.id, null);
    await db
      .update(checkoutSessions)
      .set({ status: "ABANDONED", lastActivityAt: new Date(now - 5 * HOUR), abandonedAt: new Date(now - 4 * HOUR) })
      .where(eq(checkoutSessions.id, checkoutSessionId));
  }

  // Anonymous browsing activity for funnel analytics.
  const productIds = [...new Set(variants.map((v) => v.productId))];
  const events: (typeof customerEvents.$inferInsert)[] = [];
  for (let day = 0; day < 60; day++) {
    const visitors = random.int(25, 70);
    for (let v = 0; v < visitors; v++) {
      const visitorId = `seed_v_${day}_${v}`;
      const at = () => new Date(now - day * DAY - random.int(0, 23) * HOUR - random.int(0, 59) * 60000);
      const meta = { seed: true } as Record<string, string | number | boolean>;
      events.push({ type: "PAGE_VIEW", visitorId, path: "/", createdAt: at(), metadata: meta });
      const views = random.int(0, 4);
      for (let p = 0; p < views; p++) {
        const productId = random.pick(productIds);
        events.push({ type: "PRODUCT_VIEW", visitorId, productId, path: "/product", createdAt: at(), metadata: meta });
        if (random.chance(0.12)) events.push({ type: "ADD_TO_CART", visitorId, productId, createdAt: at(), metadata: meta });
      }
      if (random.chance(0.18))
        events.push({ type: "SEARCH", visitorId, createdAt: at(), metadata: { ...meta, query: random.pick(SEARCHES) } });
    }
  }
  for (let i = 0; i < events.length; i += 1000) await db.insert(customerEvents).values(events.slice(i, i + 1000));
  console.log(`✓ Demo behavioural events: ${events.length}`);
}
