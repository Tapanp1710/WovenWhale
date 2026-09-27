import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { env } from "../../config/env";
import type { PlaceOrderResultDTO, QuoteDTO } from "../../contracts/dto";
import type { PaymentMethod } from "../../contracts/enums";
import { formatINR } from "../../contracts/money";
import type { CHECKOUT_STEPS } from "../../contracts/storefront";
import { db, type Tx } from "../../db/client";
import { carts, checkoutSessions, orderItems, orderStatusHistory, orders, payments, type AddressSnapshot } from "../../db/schema";
import { computeCancelDeadline, computePaymentExpiry } from "../../domain/deadlines";
import { DomainError } from "../../domain/errors";
import { initialStatuses } from "../../domain/order-state-machine";
import { resolveImageUrl } from "../../integrations/storage";
import { humanReference } from "../../lib/crypto";
import { getOwnedAddress } from "../account/addresses";
import { buildCartDTO, clearCart, findCart, lineIssue, loadCartLines, quoteLines, type CartLineRow } from "../cart/service";
import { redeemCoupons } from "../coupons/service";
import { recordEvent } from "../events/service";
import { applyMovement, lockInventory } from "../inventory/service";
import { kickNotificationDispatch, queueNotification } from "../notifications/service";
import { initiatePayment } from "../payments/service";
import { getStoreSettings } from "../settings/service";

/* ───────────────────────────── Checkout sessions ─────────────────────────── */

/** Creates/refreshes the customer's active checkout session (funnel + abandoned-checkout tracking). */
export async function startCheckout(userId: string, visitorId: string | null) {
  const cart = await findCart({ userId });
  const lines = cart ? await loadCartLines(cart.id) : [];
  if (!cart || lines.length === 0) throw new DomainError("CART_EMPTY", "Your bag is empty.", 422);
  const { quote } = await quoteLines(lines, cart.couponCodes, userId, null);
  const snapshot = lines.map((l) => ({
    variantId: l.variantId,
    productId: l.productId,
    name: l.name,
    size: l.size,
    quantity: l.quantity,
    unitPricePaise: l.unitPricePaise,
  }));

  const [active] = await db
    .select({ id: checkoutSessions.id })
    .from(checkoutSessions)
    .where(and(eq(checkoutSessions.userId, userId), eq(checkoutSessions.status, "ACTIVE")))
    .limit(1);
  if (active) {
    await db
      .update(checkoutSessions)
      .set({ cartSnapshot: snapshot, subtotalPaise: quote.subtotalPaise, totalPaise: quote.totalPaise, lastActivityAt: new Date() })
      .where(eq(checkoutSessions.id, active.id));
    return { checkoutSessionId: active.id };
  }
  const [created] = await db
    .insert(checkoutSessions)
    .values({ userId, cartId: cart.id, cartSnapshot: snapshot, subtotalPaise: quote.subtotalPaise, totalPaise: quote.totalPaise })
    .returning({ id: checkoutSessions.id });
  await recordEvent({ type: "CHECKOUT_STARTED", userId, visitorId, metadata: { items: quote.itemCount, total: quote.totalPaise } });
  return { checkoutSessionId: created!.id };
}

export async function touchCheckout(userId: string, step: (typeof CHECKOUT_STEPS)[number]) {
  await db
    .update(checkoutSessions)
    .set({ step, lastActivityAt: new Date() })
    .where(and(eq(checkoutSessions.userId, userId), eq(checkoutSessions.status, "ACTIVE")));
}

/* ───────────────────────────────── Quote ─────────────────────────────────── */

async function codEligibility(userId: string, totalPaise: number): Promise<{ ok: boolean; reason: string | null }> {
  const settings = await getStoreSettings();
  if (!settings.codEnabled) return { ok: false, reason: "Cash on delivery is currently unavailable." };
  if (totalPaise > settings.codMaxOrderPaise) {
    return { ok: false, reason: `Cash on delivery is available on orders up to ${formatINR(settings.codMaxOrderPaise)}.` };
  }
  const [{ rejected } = { rejected: 0 }] = await db
    .select({ rejected: count() })
    .from(orders)
    .where(and(eq(orders.userId, userId), eq(orders.paymentMethod, "COD"), eq(orders.status, "REJECTED")));
  if (Number(rejected) >= 2) return { ok: false, reason: "Cash on delivery isn't available for this account. Please pay online." };
  return { ok: true, reason: null };
}

export async function getQuote(userId: string, paymentMethod: PaymentMethod | null): Promise<QuoteDTO> {
  const cart = await findCart({ userId });
  const dto = await buildCartDTO(cart, userId, paymentMethod);
  const cod = await codEligibility(userId, dto.totals.totalPaise);
  return { ...dto, paymentMethod, codAvailable: cod.ok, codUnavailableReason: cod.reason };
}

/* ─────────────────────────────── Place order ─────────────────────────────── */

async function riskFlags(
  tx: Tx,
  userId: string,
  method: PaymentMethod,
  totalPaise: number,
  lines: CartLineRow[],
  addressPhone: string,
  accountPhone: string,
) {
  if (method !== "COD") return [];
  const flags: string[] = [];
  const [history] = await tx
    .select({
      delivered: sql<number>`count(*) filter (where ${orders.status} = 'DELIVERED')::int`,
      cancelled: sql<number>`count(*) filter (where ${orders.status} in ('CANCELLED','REJECTED'))::int`,
    })
    .from(orders)
    .where(eq(orders.userId, userId));
  if (Number(history?.delivered ?? 0) === 0) flags.push("FIRST_ORDER");
  if (Number(history?.cancelled ?? 0) >= 2) flags.push("PRIOR_CANCELLATIONS");
  if (totalPaise >= 500000) flags.push("HIGH_VALUE");
  if (lines.reduce((s, l) => s + l.quantity, 0) >= 6) flags.push("BULK_QUANTITY");
  if (addressPhone !== accountPhone) flags.push("DIFFERENT_RECIPIENT_PHONE");
  return flags;
}

async function existingOrderResult(userId: string, idempotencyKey: string): Promise<PlaceOrderResultDTO | null> {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.userId, userId), eq(orders.idempotencyKey, idempotencyKey)));
  if (!order) return null;
  let payment: PlaceOrderResultDTO["payment"] = null;
  if (order.status === "PENDING_PAYMENT") payment = await initiatePayment(order.id);
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    totalPaise: order.totalPaise,
    payment,
  };
}

/**
 * Converts the customer's bag into an order in ONE transaction:
 * re-price server-side → verify stock under row locks → reserve inventory →
 * redeem coupons atomically → snapshot address & prices → clear bag.
 * Idempotent per (customer, idempotencyKey).
 */
export async function placeOrder(
  userId: string,
  input: { addressId: string; paymentMethod: PaymentMethod; idempotencyKey: string; expectedTotalPaise: number },
  ctx: { visitorId: string | null; accountPhone: string },
): Promise<PlaceOrderResultDTO> {
  const replay = await existingOrderResult(userId, input.idempotencyKey);
  if (replay) return replay;

  const now = new Date();
  let orderId: string;
  try {
    orderId = await db.transaction(async (tx) => {
      // Serialise concurrent submissions for the same bag.
      const [cart] = await tx.select().from(carts).where(eq(carts.userId, userId)).for("update");
      if (!cart) throw new DomainError("CART_EMPTY", "Your bag is empty.", 422);
      const lines = await loadCartLines(cart.id, tx);
      if (lines.length === 0) throw new DomainError("CART_EMPTY", "Your bag is empty.", 422);

      // Lock stock first, then re-read availability under the lock.
      await lockInventory(
        tx,
        lines.map((l) => l.variantId),
      );
      const lockedLines = await loadCartLines(cart.id, tx);
      const problem = lockedLines.find((l) => lineIssue(l) !== null);
      if (problem) {
        throw new DomainError(
          lineIssue(problem)!,
          lineIssue(problem) === "INSUFFICIENT_STOCK"
            ? `Only ${problem.available} left of ${problem.name} (${problem.size}). Please update your bag.`
            : `${problem.name} (${problem.size}) is no longer available. Please update your bag.`,
          409,
        );
      }

      const { quote, unknownCoupons } = await quoteLines(lockedLines, cart.couponCodes, userId, input.paymentMethod, tx, {
        lockCoupons: true,
      });
      const badCoupon =
        quote.rejectedCoupons[0] ?? (unknownCoupons[0] ? { code: unknownCoupons[0], message: "This coupon code is not valid." } : null);
      if (badCoupon) {
        throw new DomainError("COUPON_INVALID", `Coupon ${badCoupon.code}: ${badCoupon.message} Remove it to continue.`, 409);
      }
      if (input.paymentMethod === "COD") {
        const cod = await codEligibility(userId, quote.totalPaise);
        if (!cod.ok) throw new DomainError("COD_UNAVAILABLE", cod.reason!, 422);
      }
      // RULE 7: the client total is only a consistency check, never an input.
      if (quote.totalPaise !== input.expectedTotalPaise) {
        throw new DomainError("PRICE_CHANGED", "Prices in your bag have changed. Please review the updated total.", 409, {
          totalPaise: quote.totalPaise,
        });
      }

      const address = await getOwnedAddress(tx, userId, input.addressId);
      const shippingAddress: AddressSnapshot = {
        fullName: address.fullName,
        phone: address.phone,
        email: address.email,
        line1: address.line1,
        line2: address.line2,
        area: address.area,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
        landmark: address.landmark,
        addressType: address.addressType,
      };

      const { status, paymentStatus } = initialStatuses(input.paymentMethod);
      const [order] = await tx
        .insert(orders)
        .values({
          orderNumber: humanReference("WW", 8),
          userId,
          status,
          paymentStatus,
          paymentMethod: input.paymentMethod,
          subtotalPaise: quote.subtotalPaise,
          discountPaise: quote.discountPaise,
          shippingPaise: quote.shippingPaise,
          codFeePaise: quote.codFeePaise,
          totalPaise: quote.totalPaise,
          couponCodes: quote.appliedCoupons.map((c) => c.code),
          shippingAddress,
          contactPhone: address.phone,
          contactEmail: address.email,
          idempotencyKey: input.idempotencyKey,
          riskFlags: await riskFlags(tx, userId, input.paymentMethod, quote.totalPaise, lockedLines, address.phone, ctx.accountPhone),
          placedAt: now,
          // RULE 5: deadline fixed server-side at placement.
          cancelDeadlineAt: computeCancelDeadline(now, env.ORDER_CANCELLATION_WINDOW_HOURS),
          paymentExpiresAt: input.paymentMethod === "PREPAID" ? computePaymentExpiry(now, env.PAYMENT_TIMEOUT_MINUTES) : null,
        })
        .returning();

      const pricedById = new Map(quote.lines.map((l) => [l.lineId, l]));
      await tx.insert(orderItems).values(
        lockedLines.map((l) => {
          const p = pricedById.get(l.id)!;
          return {
            orderId: order!.id,
            productId: l.productId,
            variantId: l.variantId,
            sku: l.sku,
            productName: l.name,
            size: l.size,
            imageUrl: l.imageProvider && l.imageKey ? resolveImageUrl(l.imageProvider, l.imageKey) : null,
            unitMrpPaise: l.unitMrpPaise,
            unitPricePaise: l.unitPricePaise,
            quantity: l.quantity,
            lineSubtotalPaise: p.lineSubtotalPaise,
            discountPaise: p.discountPaise,
            lineTotalPaise: p.lineTotalPaise,
          };
        }),
      );

      // RULE 8: reserve stock (committed on confirmation, released on cancel/reject).
      for (const l of lockedLines) {
        await applyMovement(tx, l.variantId, { kind: "RESERVE", quantity: l.quantity }, { orderId: order!.id, note: order!.orderNumber });
      }
      await redeemCoupons(tx, quote.appliedCoupons, userId, order!.id);

      if (input.paymentMethod === "COD") {
        await tx.insert(payments).values({ orderId: order!.id, provider: "cod", amountPaise: quote.totalPaise, status: "PAYMENT_PENDING" });
      }
      await tx.insert(orderStatusHistory).values({
        orderId: order!.id,
        fromStatus: null,
        toStatus: status,
        actorType: "CUSTOMER",
        actorId: userId,
        note: input.paymentMethod === "COD" ? "Cash on delivery — awaiting confirmation" : "Awaiting online payment",
        createdAt: now,
      });

      await clearCart(tx, cart.id);
      const [session] = await tx
        .select()
        .from(checkoutSessions)
        .where(and(eq(checkoutSessions.userId, userId), inArray(checkoutSessions.status, ["ACTIVE", "ABANDONED"])))
        .orderBy(desc(checkoutSessions.lastActivityAt))
        .limit(1);
      if (session) {
        await tx
          .update(checkoutSessions)
          .set({
            status: "CONVERTED",
            convertedOrderId: order!.id,
            lastActivityAt: now,
            recoveryStatus: session.status === "ABANDONED" ? "RECOVERED" : session.recoveryStatus,
          })
          .where(eq(checkoutSessions.id, session.id));
        await tx.update(orders).set({ checkoutSessionId: session.id }).where(eq(orders.id, order!.id));
      }

      await recordEvent(
        {
          type: "ORDER_CREATED",
          userId,
          visitorId: ctx.visitorId,
          orderId: order!.id,
          metadata: { method: input.paymentMethod, total: quote.totalPaise },
        },
        tx,
      );
      await queueNotification(tx, {
        userId,
        topic: "ORDER_PLACED",
        orderId: order!.id,
        payload: { orderNumber: order!.orderNumber, name: shippingAddress.fullName, total: formatINR(quote.totalPaise) },
      });
      return order!.id;
    });
  } catch (error) {
    // A concurrent duplicate submit lost the race on the idempotency key — return the winner.
    const code = (error as { cause?: { code?: string } }).cause?.code ?? (error as { code?: string }).code;
    if (code === "23505") {
      const winner = await existingOrderResult(userId, input.idempotencyKey);
      if (winner) return winner;
    }
    throw error;
  }
  kickNotificationDispatch();

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  const payment = order!.paymentMethod === "PREPAID" ? await initiatePayment(order!.id) : null;
  const [fresh] = await db.select().from(orders).where(eq(orders.id, orderId));
  return {
    orderNumber: fresh!.orderNumber,
    status: fresh!.status,
    paymentStatus: fresh!.paymentStatus,
    totalPaise: fresh!.totalPaise,
    payment,
  };
}
