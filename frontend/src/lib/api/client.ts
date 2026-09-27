"use client";

import { ApiError, toApiError } from "./errors";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Browser → commerce API through the storefront's own origin (/api rewrite).
 * Cookies are first-party and HttpOnly; nothing sensitive is stored in JS.
 */
export async function api<T>(path: string, init: { method?: Method; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? "GET",
      credentials: "same-origin",
      headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError(0, "NETWORK_ERROR", "Couldn't reach WovenWhale. Check your connection and try again.");
  }
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function upload<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`/api${path}`, { method: "POST", credentials: "same-origin", body: form });
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as T;
}
