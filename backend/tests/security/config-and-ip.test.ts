import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";

const BASE = {
  DATABASE_URL: "postgres://test:test@localhost:1/test",
  SESSION_SECRET: "s".repeat(48),
};

async function loadEnv(vars: Record<string, string>) {
  vi.resetModules();
  const saved = { ...process.env };
  for (const key of Object.keys(process.env))
    if (/^[A-Z_]+$/.test(key) && !["PATH", "HOME", "SYSTEMROOT", "TEMP", "TMP"].includes(key)) delete process.env[key];
  Object.assign(process.env, BASE, vars);
  try {
    return await import("../../src/config/env");
  } finally {
    process.env = saved;
  }
}

const PRODUCTION_OK = {
  NODE_ENV: "production",
  SESSION_SECRET: "p".repeat(48),
  PAYMENT_PROVIDER: "razorpay",
  RAZORPAY_KEY_ID: "rzp_live_x",
  RAZORPAY_KEY_SECRET: "x".repeat(24),
  RAZORPAY_WEBHOOK_SECRET: "w".repeat(24),
  OTP_PROVIDER: "twilio",
  TWILIO_ACCOUNT_SID: "AC" + "0".repeat(32),
  TWILIO_AUTH_TOKEN: "t".repeat(32),
  TWILIO_VERIFY_SERVICE_SID: "VA" + "0".repeat(32),
  ADMIN_MFA_REQUIRED: "true",
  MFA_ENCRYPTION_KEY: "m".repeat(48),
  CLIENT_IP_HEADER: "cf-connecting-ip",
  ALLOWED_ORIGINS: "https://wovenwhale.com",
  SITE_URL: "https://wovenwhale.com",
};

describe("production configuration guard", () => {
  afterEach(() => vi.resetModules());

  it("boots with a complete production configuration", async () => {
    await expect(loadEnv(PRODUCTION_OK)).resolves.toBeDefined();
  });

  const unsafe: [string, Record<string, string>, RegExp][] = [
    ["mock payments", { PAYMENT_PROVIDER: "mock" }, /PAYMENT_PROVIDER=mock/],
    ["mock OTP", { OTP_PROVIDER: "mock" }, /OTP_PROVIDER=mock/],
    ["relaxed rate limits", { RATE_LIMIT_MULTIPLIER: "20" }, /RATE_LIMIT_MULTIPLIER/],
    ["placeholder session secret", { SESSION_SECRET: "replace-with-a-long-random-string-xxxxxxxxxxxxxx" }, /SESSION_SECRET/],
    ["optional admin 2FA", { ADMIN_MFA_REQUIRED: "false" }, /ADMIN_MFA_REQUIRED/],
    ["missing 2FA key", { MFA_ENCRYPTION_KEY: "" }, /MFA_ENCRYPTION_KEY/],
    ["untrusted client IPs", { CLIENT_IP_HEADER: "" }, /CLIENT_IP_HEADER/],
    ["Razorpay without webhook secret", { RAZORPAY_WEBHOOK_SECRET: "" }, /RAZORPAY_WEBHOOK_SECRET/],
    ["Twilio without auth token", { TWILIO_AUTH_TOKEN: "" }, /TWILIO_AUTH_TOKEN/],
    ["plain-http origins", { ALLOWED_ORIGINS: "http://wovenwhale.com" }, /ALLOWED_ORIGINS/],
  ];
  for (const [name, override, message] of unsafe) {
    it(`refuses to boot with ${name}`, async () => {
      await expect(loadEnv({ ...PRODUCTION_OK, ...override })).rejects.toThrow(message);
    });
  }
});

describe("client IP for rate limiting", () => {
  afterEach(() => vi.resetModules());

  async function ipFor(vars: Record<string, string>, headers: Record<string, string>) {
    await loadEnv(vars);
    const { clientIp } = await import("../../src/lib/rate-limit");
    const app = new Hono().get("/", (c) => c.text(clientIp(c)));
    return (await app.request("/", { headers })).text();
  }

  it("ignores a spoofed X-Forwarded-For unless proxies are configured", async () => {
    expect(await ipFor({}, { "x-forwarded-for": "1.2.3.4" })).toBe("unknown");
  });

  it("takes the entry appended by the trusted proxy, not the client's", async () => {
    expect(await ipFor({ TRUSTED_PROXY_HOPS: "1" }, { "x-forwarded-for": "6.6.6.6, 203.0.113.9" })).toBe("203.0.113.9");
    expect(await ipFor({ TRUSTED_PROXY_HOPS: "2" }, { "x-forwarded-for": "6.6.6.6, 203.0.113.9, 10.0.0.2" })).toBe("203.0.113.9");
  });

  it("uses the edge header when configured", async () => {
    expect(
      await ipFor({ CLIENT_IP_HEADER: "cf-connecting-ip" }, { "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "6.6.6.6" }),
    ).toBe("198.51.100.7");
  });
});
