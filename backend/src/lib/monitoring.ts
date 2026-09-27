import { env } from "../config/env";
import { logger } from "./logger";

/**
 * Error-reporting seam. Every unexpected error flows through here, so wiring
 * Sentry is a one-file change:
 *
 *   npm i @sentry/node -w backend
 *   Sentry.init({ dsn: env.SENTRY_DSN, tracesSampleRate: 0.1 });
 *   → call Sentry.captureException(error, { extra: context }) below.
 */
export function captureException(error: unknown, context: Record<string, unknown> = {}): void {
  const err = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { value: String(error) };
  logger.error("unhandled_error", { ...context, error: err, reported: Boolean(env.SENTRY_DSN) });
}
