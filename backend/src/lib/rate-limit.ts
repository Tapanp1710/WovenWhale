import type { Context, MiddlewareHandler } from "hono";
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

export function clientIp(c: Context): string {
  // Trust the first X-Forwarded-For hop only behind a known proxy (Vercel / storefront rewrite).
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "unknown";
}

export async function consume(key: string, limit: number, windowMs: number): Promise<void> {
  const { count, resetAt } = await rateLimitStore.hit(key, windowMs);
  if (count > limit) {
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
