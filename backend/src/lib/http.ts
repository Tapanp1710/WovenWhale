import type { Context } from "hono";
import type { ZodType, z } from "zod";
import { DomainError } from "../domain/errors";

/** Transport-level error with a stable machine-readable code. */
export class HttpError extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 429 | 500 | 503,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const notFound = (what = "Resource") => new HttpError(404, "NOT_FOUND", `${what} not found.`);

function fieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    fields[key] ??= issue.message;
  }
  return fields;
}

export function validate<S extends ZodType>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new HttpError(400, "VALIDATION_ERROR", "Please check the highlighted fields.", fieldErrors(parsed.error));
  }
  return parsed.data;
}

/** Parses and validates a JSON body. Never trust client input beyond this point. */
export async function readJson<S extends ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
  return validate(schema, body);
}

export function readQuery<S extends ZodType>(c: Context, schema: S): z.output<S> {
  return validate(schema, c.req.query());
}

/** Unwraps a domain Result-style failure into an HTTP-mappable DomainError. */
export function assertOk(result: { ok: true } | { ok: false; code: string; message: string }, status: 409 | 422 | 403 = 422): void {
  if (!result.ok) throw new DomainError(result.code, result.message, status);
}

export const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
