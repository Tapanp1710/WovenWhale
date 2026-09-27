import { Hono } from "hono";
import type { AppEnv } from "../../app-env";
import { env } from "../../config/env";
import { adminLoginSchema } from "../../contracts/admin";
import { profileUpdateSchema, sendOtpSchema, verifyOtpSchema } from "../../contracts/storefront";
import { COOKIE, clearCookie, readCookie, writeCookie } from "../../lib/cookies";
import { readJson } from "../../lib/http";
import { rateLimit } from "../../lib/rate-limit";
import { mergeGuestCart } from "../cart/service";
import { recordEvent } from "../events/service";
import { customerOf, requireAdmin, requireCustomer } from "./middleware";
import { adminLogin, getAdminSession, getCustomer, sendOtp, updateProfile, verifyOtpAndSignIn } from "./service";
import { revokeSession } from "./sessions";

export const customerAuthRoutes = new Hono<AppEnv>()
  .post("/otp/send", rateLimit("otp-send-ip", 10, 10 * 60 * 1000), async (c) => {
    const { phone } = await readJson(c, sendOtpSchema);
    return c.json(await sendOtp(phone));
  })
  .post("/otp/verify", rateLimit("otp-verify-ip", 20, 10 * 60 * 1000), async (c) => {
    const { phone, code } = await readJson(c, verifyOtpSchema);
    const { token, userId, isNew } = await verifyOtpAndSignIn(phone, code, c.req.header("user-agent") ?? null);
    writeCookie(c, COOKIE.customerSession, token, env.CUSTOMER_SESSION_TTL_DAYS * 24 * 60 * 60);

    const guestToken = readCookie(c, COOKIE.guestCart);
    if (guestToken) {
      await mergeGuestCart(guestToken, userId);
      clearCookie(c, COOKIE.guestCart);
    }
    await recordEvent({ type: "SIGNED_IN", userId, visitorId: c.get("visitorId"), metadata: { isNew } });
    return c.json({ customer: await getCustomer(userId), isNew });
  })
  .post("/logout", async (c) => {
    const token = readCookie(c, COOKIE.customerSession);
    if (token) await revokeSession(token);
    clearCookie(c, COOKIE.customerSession);
    return c.json({ ok: true });
  })
  .get("/me", async (c) => {
    const customer = c.get("customer");
    return c.json({ customer: customer ? await getCustomer(customer.id) : null });
  })
  .patch("/profile", requireCustomer, async (c) => {
    const input = await readJson(c, profileUpdateSchema);
    return c.json({ customer: await updateProfile(customerOf(c).id, input) });
  });

export const adminAuthRoutes = new Hono<AppEnv>()
  .post("/login", rateLimit("admin-login-ip", 20, 15 * 60 * 1000), async (c) => {
    const { email, password } = await readJson(c, adminLoginSchema);
    const { token, mfaRequired } = await adminLogin(email, password, c.req.header("user-agent") ?? null);
    writeCookie(c, COOKIE.adminSession, token, env.ADMIN_SESSION_TTL_HOURS * 60 * 60);
    return c.json({ mfaRequired });
  })
  .post("/logout", async (c) => {
    const token = readCookie(c, COOKIE.adminSession);
    if (token) await revokeSession(token);
    clearCookie(c, COOKIE.adminSession);
    return c.json({ ok: true });
  })
  .get("/me", requireAdmin, async (c) => c.json({ admin: await getAdminSession(c.get("admin")!.id) }));
