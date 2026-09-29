import { Hono } from "hono";
import type { AppEnv } from "../../app-env";
import { env } from "../../config/env";
import type { AdminSessionDTO } from "../../contracts/dto";
import { adminLoginSchema, mfaVerifySchema, totpCodeSchema } from "../../contracts/admin";
import { profileUpdateSchema, sendOtpSchema, verifyOtpSchema } from "../../contracts/storefront";
import { COOKIE, clearCookie, readCookie, writeCookie } from "../../lib/cookies";
import { readJson } from "../../lib/http";
import { rateLimit } from "../../lib/rate-limit";
import { mergeGuestCart } from "../cart/service";
import { recordEvent } from "../events/service";
import { adminOf, adminSessionOf, customerOf, requireAdmin, requireAdminSession, requireCustomer } from "./middleware";
import { beginSetup, disableMfa, enableMfa, mfaStatus, regenerateRecoveryCodes, verifySecondFactor } from "./mfa";
import { adminLogin, getCustomer, sendOtp, updateProfile, verifyOtpAndSignIn } from "./service";
import { revokeSession } from "./sessions";

export const customerAuthRoutes = new Hono<AppEnv>()
  .post("/otp/send", rateLimit("otp-send-ip", 10, 10 * 60 * 1000), async (c) => {
    const { phone } = await readJson(c, sendOtpSchema);
    return c.json(await sendOtp(phone));
  })
  .post("/otp/verify", rateLimit("otp-verify-ip", 20, 10 * 60 * 1000), async (c) => {
    const { phone, code } = await readJson(c, verifyOtpSchema);
    const { token, userId, isNew } = await verifyOtpAndSignIn(phone, code, c.req.header("user-agent") ?? null);
    // Never keep a session that existed before sign-in (session fixation).
    const previous = readCookie(c, COOKIE.customerSession);
    if (previous) await revokeSession(previous);
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
    const { token, step, ttlSeconds } = await adminLogin(email, password, c.req.header("user-agent") ?? null);
    writeCookie(c, COOKIE.adminSession, token, ttlSeconds);
    return c.json({ step });
  })
  .post("/logout", async (c) => {
    const token = readCookie(c, COOKIE.adminSession);
    if (token) await revokeSession(token);
    clearCookie(c, COOKIE.adminSession);
    return c.json({ ok: true });
  })
  // Answered from what requireAdmin already loaded: no extra database round trips.
  .get("/me", requireAdmin, (c) => {
    const admin = adminOf(c);
    return c.json({
      admin: {
        id: admin.id,
        email: admin.email,
        fullName: admin.fullName,
        role: admin.role,
        permissions: [...admin.permissions],
        mfaEnabled: adminSessionOf(c).mfaEnabled,
        mfaRequired: env.ADMIN_MFA_REQUIRED,
      } satisfies AdminSessionDTO,
    });
  })
  /* ── Two-factor authentication ── */
  .get("/2fa/status", requireAdminSession, async (c) => {
    const session = adminSessionOf(c);
    return c.json(await mfaStatus(session.id, session.mfaVerified));
  })
  .post("/2fa/verify", rateLimit("admin-mfa-ip", 20, 15 * 60 * 1000), requireAdminSession, async (c) => {
    const input = await readJson(c, mfaVerifySchema);
    const token = await verifySecondFactor(adminSessionOf(c).id, input, c.req.header("user-agent") ?? null);
    writeCookie(c, COOKIE.adminSession, token, env.ADMIN_SESSION_TTL_HOURS * 60 * 60);
    return c.json({ ok: true });
  })
  .post("/2fa/setup", rateLimit("admin-mfa-setup-ip", 10, 15 * 60 * 1000), requireAdminSession, async (c) =>
    c.json(await beginSetup(adminSessionOf(c))),
  )
  .post("/2fa/enable", rateLimit("admin-mfa-setup-ip", 10, 15 * 60 * 1000), requireAdminSession, async (c) => {
    const { code } = await readJson(c, totpCodeSchema);
    const { token, recoveryCodes } = await enableMfa(adminSessionOf(c), code, c.req.header("user-agent") ?? null);
    writeCookie(c, COOKIE.adminSession, token, env.ADMIN_SESSION_TTL_HOURS * 60 * 60);
    return c.json({ recoveryCodes });
  })
  .post("/2fa/recovery-codes", rateLimit("admin-mfa-ip", 20, 15 * 60 * 1000), requireAdmin, async (c) => {
    const { code } = await readJson(c, totpCodeSchema);
    return c.json({ recoveryCodes: await regenerateRecoveryCodes(adminOf(c), code) });
  })
  .post("/2fa/disable", rateLimit("admin-mfa-ip", 20, 15 * 60 * 1000), requireAdmin, async (c) => {
    const { code } = await readJson(c, totpCodeSchema);
    await disableMfa(adminOf(c), code);
    return c.json({ ok: true });
  });
