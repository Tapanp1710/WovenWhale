import "server-only";
import { cookies } from "next/headers";
import { ApiError, toApiError } from "./errors";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:4000";

/**
 * Public, cacheable reads (catalog). No cookies are sent, so responses can be
 * shared between visitors and revalidated on an interval.
 */
export async function publicApi<T>(path: string, revalidate = 60, tags = ["catalog"]): Promise<T> {
  const res = await fetch(`${BACKEND}/api${path}`, { next: { revalidate, tags } });
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as T;
}

/** Personalised reads on behalf of the current visitor (forwards their session cookies). */
export async function sessionApi<T>(path: string): Promise<T> {
  const jar = await cookies();
  const res = await fetch(`${BACKEND}/api${path}`, { cache: "no-store", headers: { cookie: jar.toString() } });
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as T;
}

/** Like sessionApi but maps 401/404 to null for "not signed in" / "not found" pages. */
export async function sessionApiOrNull<T>(path: string): Promise<T | null> {
  try {
    return await sessionApi<T>(path);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 404)) return null;
    throw error;
  }
}

/**
 * For account pages. Next renders the account layout and page in parallel, so
 * a signed-out visitor reaches the page even though the layout shows sign-in:
 * return null (render nothing) instead of throwing a 401.
 */
export async function accountApi<T>(path: string): Promise<T | null> {
  try {
    return await sessionApi<T>(path);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function publicApiOrNull<T>(path: string, revalidate = 60): Promise<T | null> {
  try {
    return await publicApi<T>(path, revalidate);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
