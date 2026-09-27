import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../app-env";
import { allowedOrigins } from "../config/env";
import { COOKIE, readCookie, writeCookie } from "./cookies";
import { randomToken } from "./crypto";
import { HttpError } from "./http";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence for cookie-authenticated, state-changing requests.
 * Browsers always send `Origin` on cross-site POST/PUT/PATCH/DELETE; we accept
 * only configured storefront origins. Signed webhooks are exempt (they carry
 * no cookies and are verified by signature).
 */
export const originGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (SAFE_METHODS.has(c.req.method) || c.req.path.startsWith("/api/webhooks/")) return next();

  const origin = c.req.header("origin");
  if (origin) {
    if (!allowedOrigins.has(origin)) throw new HttpError(403, "CSRF_REJECTED", "Request origin not allowed.");
    return next();
  }
  // No Origin: allow only when no auth cookie is present (non-browser API clients).
  const hasAuthCookie = Boolean(readCookie(c, COOKIE.customerSession) || readCookie(c, COOKIE.adminSession));
  if (hasAuthCookie) {
    const referer = c.req.header("referer");
    const refererOrigin = referer ? new URL(referer).origin : null;
    if (!refererOrigin || !allowedOrigins.has(refererOrigin)) {
      throw new HttpError(403, "CSRF_REJECTED", "Request origin not allowed.");
    }
  }
  return next();
};

/** Anonymous first-party visitor id for funnel analytics (no personal data). */
export const visitorId: MiddlewareHandler<AppEnv> = async (c, next) => {
  let id = readCookie(c, COOKIE.visitor);
  if (id && !/^[\w-]{16,64}$/.test(id)) id = null;
  // Only mint the cookie on real browser requests, not server-side renders.
  if (!id && (c.req.header("sec-fetch-site") || c.req.header("origin"))) {
    id = randomToken(16);
    writeCookie(c, COOKIE.visitor, id, 60 * 60 * 24 * 365);
  }
  c.set("visitorId", id);
  await next();
};
