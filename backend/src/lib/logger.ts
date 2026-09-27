import { env } from "../config/env";

type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel: Level = env.NODE_ENV === "production" ? "info" : "debug";

/** Keys whose values are never written to logs. */
const REDACT = /password|secret|token|authorization|cookie|signature|apikey|^otp$|^code$/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, REDACT.test(k) ? "[redacted]" : redact(v, depth + 1)]),
  );
}

/** Masks all but the last 4 digits of a phone number for logs. */
export const maskPhone = (phone: string) => phone.replace(/\d(?=\d{4})/g, "•");

function write(level: Level, msg: string, ctx?: Record<string, unknown>) {
  if (order[level] < order[minLevel]) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...(ctx ? (redact(ctx) as object) : {}) });
  (level === "error" || level === "warn" ? console.error : console.log)(line);
}

/** Structured JSON logger with automatic redaction of sensitive fields. */
export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => write("debug", msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => write("info", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => write("warn", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => write("error", msg, ctx),
};
