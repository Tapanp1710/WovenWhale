import "server-only";
import type { AdminSessionDTO, Permission } from "@wovenwhale/backend/contracts";
import { redirect } from "next/navigation";
import { cache } from "react";
import { sessionApiOrNull } from "@/lib/api/server";
import { can } from "./labels";

/** One /auth/me call per request, shared by the layout and every page. */
export const getAdmin = cache(async () => (await sessionApiOrNull<{ admin: AdminSessionDTO }>("/admin/auth/me"))?.admin ?? null);

/** Returns the admin when they hold one of the permissions, null when they don't; redirects when signed out. */
export async function adminWith(...perms: Permission[]) {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  return can(admin, ...perms) ? admin : null;
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Flattens Next's search params and drops empty values, ready to forward to the API. */
export async function readParams(searchParams: SearchParams, keys: readonly string[]) {
  const raw = await searchParams;
  const out: Record<string, string> = {};
  for (const key of keys) {
    const v = raw[key];
    const value = Array.isArray(v) ? v[0] : v;
    if (value) out[key] = value;
  }
  return out;
}

export const toQuery = (params: Record<string, string | undefined>) => {
  const qs = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1]))).toString();
  return qs ? `?${qs}` : "";
};
