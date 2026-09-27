import type { Context } from "hono";
import { Hono } from "hono";
import type { AppEnv } from "../../app-env";
import { addCartItemSchema, applyCouponSchema, updateCartItemSchema } from "../../contracts/storefront";
import { COOKIE, readCookie, writeCookie } from "../../lib/cookies";
import { readJson } from "../../lib/http";
import { rateLimit } from "../../lib/rate-limit";
import {
  addItem,
  applyCoupon,
  buildCartDTO,
  findCart,
  newGuestToken,
  removeCoupon,
  removeItem,
  updateItemQuantity,
  type CartOwner,
} from "./service";

const GUEST_CART_TTL_S = 60 * 60 * 24 * 30;

/** Customer cart when signed in; otherwise a guest cart keyed by an HttpOnly cookie. */
function cartOwner(c: Context<AppEnv>, create: boolean): CartOwner | null {
  const customer = c.get("customer");
  if (customer) return { userId: customer.id };
  let token = readCookie(c, COOKIE.guestCart);
  if (!token && create) {
    token = newGuestToken();
    writeCookie(c, COOKIE.guestCart, token, GUEST_CART_TTL_S);
  }
  return token ? { guestToken: token } : null;
}

async function respond(c: Context<AppEnv>, owner: CartOwner | null) {
  const cart = owner ? await findCart(owner) : null;
  return c.json(await buildCartDTO(cart, c.get("customer")?.id ?? null));
}

export const cartRoutes = new Hono<AppEnv>()
  .get("/", async (c) => respond(c, cartOwner(c, false)))
  .post("/items", rateLimit("cart-write", 120, 60 * 1000), async (c) => {
    const { variantId, quantity } = await readJson(c, addCartItemSchema);
    const owner = cartOwner(c, true)!;
    await addItem(owner, variantId, quantity, c.get("visitorId"));
    return respond(c, owner);
  })
  .patch("/items/:id", async (c) => {
    const { quantity } = await readJson(c, updateCartItemSchema);
    const owner = cartOwner(c, true)!;
    await updateItemQuantity(owner, c.req.param("id"), quantity);
    return respond(c, owner);
  })
  .delete("/items/:id", async (c) => {
    const owner = cartOwner(c, true)!;
    await removeItem(owner, c.req.param("id"), c.get("visitorId"));
    return respond(c, owner);
  })
  .post("/coupons", rateLimit("coupon-apply", 20, 10 * 60 * 1000), async (c) => {
    const { code } = await readJson(c, applyCouponSchema);
    const owner = cartOwner(c, true)!;
    await applyCoupon(owner, code);
    return respond(c, owner);
  })
  .delete("/coupons/:code", async (c) => {
    const owner = cartOwner(c, true)!;
    await removeCoupon(owner, c.req.param("code"));
    return respond(c, owner);
  });
