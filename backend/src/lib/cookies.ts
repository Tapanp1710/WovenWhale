import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { isProduction } from "../config/env";

export const COOKIE = {
  customerSession: "ww_sid",
  adminSession: "ww_asid",
  guestCart: "ww_cart",
  visitor: "ww_vid",
} as const;

type CookieName = (typeof COOKIE)[keyof typeof COOKIE];

/**
 * All auth cookies are HttpOnly + Secure (production) + SameSite. Admin
 * cookies use SameSite=Strict so they are never sent on cross-site navigations.
 */
export function writeCookie(c: Context, name: CookieName, value: string, maxAgeSeconds: number) {
  setCookie(c, name, value, {
    httpOnly: true,
    secure: isProduction,
    sameSite: name === COOKIE.adminSession ? "Strict" : "Lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export const readCookie = (c: Context, name: CookieName) => getCookie(c, name) ?? null;

export const clearCookie = (c: Context, name: CookieName) => deleteCookie(c, name, { path: "/", secure: isProduction });
