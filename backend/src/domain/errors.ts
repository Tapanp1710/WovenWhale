/**
 * Business rule violation. Carries a stable machine-readable `code` that the
 * API returns to clients and that the storefront maps to user-facing copy.
 */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 429 = 422,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export type Result<T = void> = { ok: true; value: T } | { ok: false; code: string; message: string };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = (code: string, message: string): { ok: false; code: string; message: string } => ({
  ok: false,
  code,
  message,
});
