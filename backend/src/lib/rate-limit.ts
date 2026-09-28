import type { Context, MiddlewareHandler } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import { env } from "../config/env";
import { HttpError } from "./http";

/**
 * Fixed-window rate limiter.
 *
 * ponytail: in-memory store — correct for a single API instance. When running
 * more than one instance, back `RateLimitStore` with Redis (INCR + PEXPIRE on
 * REDIS_URL); the middleware API does not change.
 */
export interface RateLimitStore {
  hit(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
}

class MemoryStore implements RateLimitStore {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  constructor() {
    setInterval(() => {
      const now = Date.now();
      for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k);
    }, 60_000).unref();
  }

  async hit(key: string, windowMs: number) {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      const fresh = { count: 1, resetAt: now + windowMs };
      this.buckets.set(key, fresh);
      return fresh;
    }
    bucket.count += 1;
    return bucket;
  }
}

export const rateLimitStore: RateLimitStore = new MemoryStore();

/**
 * The client address used for rate limiting. Forwarding headers are only
 * trusted as configured, because clients can send any value in them:
 * - CLIENT_IP_HEADER: a header your edge overwrites with the real client IP (e.g. cf-connecting-ip)
 * - TRUSTED_PROXY_HOPS: proxies you run that append to X-Forwarded-For; the entry that many from the right is used
 * - otherwise the TCP peer address
 */
export function clientIp(c: Context): string {
  if (env.CLIENT_IP_HEADER) return c.req.header(env.CLIENT_IP_HEADER)?.trim() || "unknown";
  if (env.TRUSTED_PROXY_HOPS > 0) {
    const chain = (c.req.header("x-forwarded-for") ?? "")
      .split(",")
      .map((ip) => ip.trim())
      .filter(Boolean);
    const ip = chain[chain.length - env.TRUSTED_PROXY_HOPS];
    if (ip) return ip;
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown"; // No socket (in-process test requests).
  }
}

export async function consume(key: string, limit: number, windowMs: number): Promise<void> {
  const { count, resetAt } = await rateLimitStore.hit(key, windowMs);
  if (count > limit * env.RATE_LIMIT_MULTIPLIER) {
    const seconds = Math.ceil((resetAt - Date.now()) / 1000);
    throw new HttpError(429, "RATE_LIMITED", `Too many attempts. Please try again in ${seconds} seconds.`);
  }
}

export function rateLimit(name: string, limit: number, windowMs: number, key: (c: Context) => string = clientIp): MiddlewareHandler {
  return async (c, next) => {
    await consume(`${name}:${key(c)}`, limit, windowMs);
    await next();
  };
}
