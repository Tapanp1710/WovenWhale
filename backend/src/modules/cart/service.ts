import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { CartDTO, CartLineDTO } from "../../contracts/dto";
import type { PaymentMethod } from "../../contracts/enums";
import { MAX_QTY_PER_LINE } from "../../contracts/storefront";
import { db, type DbOrTx } from "../../db/client";
import { ref } from "../../db/sql";
import { cartItems, carts, inventory, productCategories, productImages, productVariants, products } from "../../db/schema";
import { COUPON_ERRORS, MAX_COUPONS_PER_ORDER, normalizeCouponCode } from "../../domain/coupons";
import { DomainError } from "../../domain/errors";
import { priceCart, type PriceQuote, type PricingLineInput } from "../../domain/pricing";
import { resolveImageUrl } from "../../integrations/storage";
import { randomToken, sha256 } from "../../lib/crypto";
import { loadCouponRules, loadCustomerCouponContext } from "../coupons/service";
import { recordEvent } from "../events/service";
import { getStoreSettings, shippingRules } from "../settings/service";

/** Who owns the cart: a signed-in customer or an anonymous guest cookie. */
export type CartOwner = { userId: string } | { guestToken: string };

export interface CartLineRow {
  id: string;
  variantId: string;
  productId: string;
  quantity: number;
  slug: string;
  name: string;
  sku: string;
  size: string;
  color: string | null;
  unitPricePaise: number;
  unitMrpPaise: number;
  available: number;
  purchasable: boolean;
  imageProvider: string | null;
  imageKey: string | null;
  categoryIds: string[];
}

export const newGuestToken = () => randomToken(24);

export async function findCart(owner: CartOwner, tx: DbOrTx = db) {
  const where = "userId" in owner ? eq(carts.userId, owner.userId) : eq(carts.guestTokenHash, sha256(owner.guestToken));
  const [cart] = await tx.select().from(carts).where(where);
  return cart ?? null;
}

export async function getOrCreateCart(owner: CartOwner, tx: DbOrTx = db) {
  const existing = await findCart(owner, tx);
  if (existing) return existing;
  const values = "userId" in owner ? { userId: owner.userId } : { guestTokenHash: sha256(owner.guestToken) };
  const [created] = await tx.insert(carts).values(values).onConflictDoNothing().returning();
  return created ?? (await findCart(owner, tx))!;
}

/** Cart lines joined with live catalog price, stock and imagery. */
export async function loadCartLines(cartId: string, tx: DbOrTx = db): Promise<CartLineRow[]> {
  const rows = await tx
    .select({
      id: cartItems.id,
      variantId: cartItems.variantId,
      quantity: cartItems.quantity,
      productId: products.id,
      slug: products.slug,
      name: products.name,
      sku: productVariants.sku,
      size: productVariants.size,
      color: productVariants.color,
      unitPricePaise: sql<number>`coalesce(${productVariants.pricePaise}, ${products.pricePaise})::int`,
      unitMrpPaise: sql<number>`coalesce(${productVariants.mrpPaise}, ${products.mrpPaise})::int`,
      available: sql<number>`coalesce(${inventory.onHand} - ${inventory.reserved}, 0)::int`,
      purchasable: sql<boolean>`${products.isActive} and ${products.deletedAt} is null and ${productVariants.isActive}`,
      imageProvider: sql<
        string | null
      >`(select provider from ${productImages} pi where pi.product_id = ${ref(products.id)} order by sort_order limit 1)`,
      imageKey: sql<
        string | null
      >`(select storage_key from ${productImages} pi where pi.product_id = ${ref(products.id)} order by sort_order limit 1)`,
    })
    .from(cartItems)
    .innerJoin(productVariants, eq(productVariants.id, cartItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(eq(cartItems.cartId, cartId))
    .orderBy(asc(cartItems.createdAt));

  const productIds = [...new Set(rows.map((r) => r.productId))];
  const cats = productIds.length ? await tx.select().from(productCategories).where(inArray(productCategories.productId, productIds)) : [];
  return rows.map((r) => ({
    ...r,
    unitPricePaise: Number(r.unitPricePaise),
    unitMrpPaise: Number(r.unitMrpPaise),
    available: Math.max(0, Number(r.available)),
    purchasable: Boolean(r.purchasable),
    categoryIds: cats.filter((c) => c.productId === r.productId).map((c) => c.categoryId),
  }));
}

export function lineIssue(line: CartLineRow): CartLineDTO["issue"] {
  if (!line.purchasable) return "UNAVAILABLE";
  if (line.available <= 0) return "OUT_OF_STOCK";
  if (line.quantity > line.available) return "INSUFFICIENT_STOCK";
  return null;
}

/**
 * Prices a set of cart lines with the authoritative pricing engine. Lines that
 * can't be bought at all are excluded from totals but still shown.
 */
export async function quoteLines(
  lines: CartLineRow[],
  couponCodes: string[],
  userId: string | null,
  paymentMethod: PaymentMethod | null,
  tx: DbOrTx = db,
  opts: { lockCoupons?: boolean } = {},
): Promise<{ quote: PriceQuote; unknownCoupons: string[] }> {
  const settings = await getStoreSettings();
  const { rules, unknown } = await loadCouponRules(tx, couponCodes, { lock: opts.lockCoupons });
  const customer = await loadCustomerCouponContext(
    tx,
    userId,
    rules.map((r) => r.id),
  );
  const pricingLines: PricingLineInput[] = lines
    .filter((l) => {
      const issue = lineIssue(l);
      return issue === null || issue === "INSUFFICIENT_STOCK";
    })
    .map((l) => ({
      lineId: l.id,
      productId: l.productId,
      categoryIds: l.categoryIds,
      quantity: l.quantity,
      unitPricePaise: l.unitPricePaise,
      unitMrpPaise: l.unitMrpPaise,
    }));
  const quote = priceCart({
    lines: pricingLines,
    coupons: rules,
    customer,
    shipping: shippingRules(settings),
    paymentMethod,
    now: new Date(),
  });
  return { quote, unknownCoupons: unknown };
}

export async function buildCartDTO(
  cart: { id: string; couponCodes: string[] } | null,
  userId: string | null,
  paymentMethod: PaymentMethod | null = null,
): Promise<CartDTO> {
  const settings = await getStoreSettings();
  const lines = cart ? await loadCartLines(cart.id) : [];
  const { quote, unknownCoupons } = await quoteLines(lines, cart?.couponCodes ?? [], userId, paymentMethod);
  const priced = new Map(quote.lines.map((l) => [l.lineId, l]));

  const lineDTOs: CartLineDTO[] = lines.map((l) => {
    const p = priced.get(l.id);
    return {
      id: l.id,
      variantId: l.variantId,
      productId: l.productId,
      slug: l.slug,
      name: l.name,
      size: l.size,
      color: l.color,
      imageUrl: l.imageProvider && l.imageKey ? resolveImageUrl(l.imageProvider, l.imageKey) : null,
      quantity: l.quantity,
      unitPricePaise: l.unitPricePaise,
      unitMrpPaise: l.unitMrpPaise,
      lineSubtotalPaise: p?.lineSubtotalPaise ?? 0,
      discountPaise: p?.discountPaise ?? 0,
      lineTotalPaise: p?.lineTotalPaise ?? 0,
      available: l.available,
      issue: lineIssue(l),
    };
  });

  const afterDiscount = quote.subtotalPaise - quote.discountPaise;
  return {
    id: cart?.id ?? null,
    lines: lineDTOs,
    totals: {
      mrpTotalPaise: quote.mrpTotalPaise,
      subtotalPaise: quote.subtotalPaise,
      productSavingsPaise: quote.productSavingsPaise,
      discountPaise: quote.discountPaise,
      shippingPaise: quote.shippingPaise,
      codFeePaise: quote.codFeePaise,
      totalPaise: quote.totalPaise,
      itemCount: lineDTOs.reduce((s, l) => s + l.quantity, 0),
      freeShippingRemainingPaise: Math.max(0, settings.freeShippingThresholdPaise - afterDiscount),
    },
    appliedCoupons: quote.appliedCoupons.map((c) => ({ code: c.code, discountPaise: c.discountPaise })),
    couponErrors: [
      ...quote.rejectedCoupons,
      ...unknownCoupons.map((code) => ({ code, errorCode: COUPON_ERRORS.NOT_FOUND, message: "This coupon code is not valid." })),
    ],
    hasIssues: lineDTOs.some((l) => l.issue !== null),
  };
}

async function assertVariantPurchasable(variantId: string, desiredQty: number) {
  const [v] = await db
    .select({
      id: productVariants.id,
      productId: productVariants.productId,
      purchasable: sql<boolean>`${products.isActive} and ${products.deletedAt} is null and ${productVariants.isActive}`,
      available: sql<number>`coalesce(${inventory.onHand} - ${inventory.reserved}, 0)::int`,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(eq(productVariants.id, variantId));
  if (!v || !v.purchasable) throw new DomainError("PRODUCT_UNAVAILABLE", "This product is no longer available.", 404);
  const available = Math.max(0, Number(v.available));
  if (available <= 0) throw new DomainError("OUT_OF_STOCK", "This size is sold out.", 409, { available });
  if (desiredQty > available) {
    throw new DomainError("INSUFFICIENT_STOCK", `Only ${available} left in this size.`, 409, { available });
  }
  return v;
}

export async function addItem(owner: CartOwner, variantId: string, quantity: number, visitorId: string | null) {
  const cart = await getOrCreateCart(owner);
  const [existing] = await db
    .select()
    .from(cartItems)
    .where(and(eq(cartItems.cartId, cart.id), eq(cartItems.variantId, variantId)));
  const desired = (existing?.quantity ?? 0) + quantity;
  if (desired > MAX_QTY_PER_LINE) {
    throw new DomainError("QUANTITY_LIMIT", `You can add up to ${MAX_QTY_PER_LINE} of each size.`, 422);
  }
  const variant = await assertVariantPurchasable(variantId, desired);
  await db
    .insert(cartItems)
    .values({ cartId: cart.id, variantId, quantity: desired })
    .onConflictDoUpdate({ target: [cartItems.cartId, cartItems.variantId], set: { quantity: desired, updatedAt: new Date() } });
  await db.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cart.id));
  await recordEvent({
    type: "ADD_TO_CART",
    userId: "userId" in owner ? owner.userId : null,
    visitorId,
    productId: variant.productId,
    metadata: { quantity },
  });
  return cart;
}

async function ownedItem(owner: CartOwner, itemId: string) {
  const cart = await findCart(owner);
  if (!cart) throw new DomainError("NOT_FOUND", "Item not found in your bag.", 404);
  const [item] = await db
    .select({ id: cartItems.id, variantId: cartItems.variantId, productId: productVariants.productId })
    .from(cartItems)
    .innerJoin(productVariants, eq(productVariants.id, cartItems.variantId))
    .where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cart.id)));
  if (!item) throw new DomainError("NOT_FOUND", "Item not found in your bag.", 404);
  return { cart, item };
}

export async function updateItemQuantity(owner: CartOwner, itemId: string, quantity: number) {
  const { cart, item } = await ownedItem(owner, itemId);
  await assertVariantPurchasable(item.variantId, quantity);
  await db.update(cartItems).set({ quantity, updatedAt: new Date() }).where(eq(cartItems.id, item.id));
  return cart;
}

export async function removeItem(owner: CartOwner, itemId: string, visitorId: string | null) {
  const { cart, item } = await ownedItem(owner, itemId);
  await db.delete(cartItems).where(eq(cartItems.id, item.id));
  await recordEvent({
    type: "REMOVE_FROM_CART",
    userId: "userId" in owner ? owner.userId : null,
    visitorId,
    productId: item.productId,
  });
  return cart;
}

/** Validates a coupon against the current bag before remembering it. */
export async function applyCoupon(owner: CartOwner, rawCode: string) {
  const code = normalizeCouponCode(rawCode);
  const cart = await getOrCreateCart(owner);
  if (cart.couponCodes.includes(code)) throw new DomainError(COUPON_ERRORS.DUPLICATE, "This coupon is already applied.", 409);
  if (cart.couponCodes.length >= MAX_COUPONS_PER_ORDER) {
    throw new DomainError(COUPON_ERRORS.TOO_MANY, `At most ${MAX_COUPONS_PER_ORDER} coupons can be combined.`, 422);
  }
  const lines = await loadCartLines(cart.id);
  if (lines.length === 0) throw new DomainError("CART_EMPTY", "Add something to your bag first.", 422);

  const userId = "userId" in owner ? owner.userId : null;
  const codes = [...cart.couponCodes, code];
  const { quote, unknownCoupons } = await quoteLines(lines, codes, userId, null);
  if (unknownCoupons.includes(code)) throw new DomainError(COUPON_ERRORS.NOT_FOUND, "This coupon code is not valid.", 422);
  const rejected = quote.rejectedCoupons.find((r) => r.code === code);
  if (rejected) throw new DomainError(rejected.errorCode, rejected.message, 422);

  await db.update(carts).set({ couponCodes: codes, updatedAt: new Date() }).where(eq(carts.id, cart.id));
  return { ...cart, couponCodes: codes };
}

export async function removeCoupon(owner: CartOwner, rawCode: string) {
  const code = normalizeCouponCode(rawCode);
  const cart = await getOrCreateCart(owner);
  const codes = cart.couponCodes.filter((c) => c !== code);
  await db.update(carts).set({ couponCodes: codes, updatedAt: new Date() }).where(eq(carts.id, cart.id));
  return { ...cart, couponCodes: codes };
}

/** On sign-in: folds the guest bag into the customer's bag (quantities capped) and deletes the guest cart. */
export async function mergeGuestCart(guestToken: string, userId: string) {
  const guest = await findCart({ guestToken });
  if (!guest) return;
  await db.transaction(async (tx) => {
    const target = await getOrCreateCart({ userId }, tx);
    const items = await tx.select().from(cartItems).where(eq(cartItems.cartId, guest.id));
    for (const item of items) {
      await tx
        .insert(cartItems)
        .values({ cartId: target.id, variantId: item.variantId, quantity: Math.min(item.quantity, MAX_QTY_PER_LINE) })
        .onConflictDoUpdate({
          target: [cartItems.cartId, cartItems.variantId],
          set: { quantity: sql`least(${cartItems.quantity} + excluded.quantity, ${MAX_QTY_PER_LINE})`, updatedAt: new Date() },
        });
    }
    const codes = [...new Set([...target.couponCodes, ...guest.couponCodes])].slice(0, MAX_COUPONS_PER_ORDER);
    await tx.update(carts).set({ couponCodes: codes, updatedAt: new Date() }).where(eq(carts.id, target.id));
    await tx.delete(carts).where(eq(carts.id, guest.id));
  });
}

export async function clearCart(tx: DbOrTx, cartId: string) {
  await tx.delete(cartItems).where(eq(cartItems.cartId, cartId));
  await tx.update(carts).set({ couponCodes: [], updatedAt: new Date() }).where(eq(carts.id, cartId));
}
