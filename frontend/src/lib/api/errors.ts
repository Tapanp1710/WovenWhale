import type { ApiErrorBody } from "@wovenwhale/backend/contracts";

/** Error returned by the commerce API, carrying its stable machine-readable code. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields: Record<string, string> = {},
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function toApiError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  if (body?.error) return new ApiError(res.status, body.error.code, body.error.message, body.error.fields, body.error.details);
  return new ApiError(
    res.status,
    "HTTP_ERROR",
    res.status >= 500 ? "Something went wrong on our side. Please try again." : "Request failed.",
  );
}

export const errorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : "Couldn't reach WovenWhale. Check your connection and try again.";
