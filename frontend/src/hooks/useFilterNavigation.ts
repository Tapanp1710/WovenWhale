"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import type { MultiKey } from "@/lib/catalog-params";

/**
 * Reads and writes catalog filters in the URL so every filtered view is
 * shareable and back/forward navigable. Any change resets to page 1.
 */
export function useFilterNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const commit = useCallback(
    (next: URLSearchParams) => {
      next.delete("page");
      const qs = next.toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [pathname, router],
  );

  const values = useCallback((key: MultiKey) => params.get(key)?.split(",").filter(Boolean) ?? [], [params]);

  const toggle = useCallback(
    (key: MultiKey, value: string) => {
      const next = new URLSearchParams(params.toString());
      const current = next.get(key)?.split(",").filter(Boolean) ?? [];
      const updated = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      if (updated.length) next.set(key, updated.join(","));
      else next.delete(key);
      commit(next);
    },
    [params, commit],
  );

  const set = useCallback(
    (entries: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(entries)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      commit(next);
    },
    [params, commit],
  );

  const clearAll = useCallback(() => {
    const next = new URLSearchParams();
    for (const keep of ["q", "sort"]) {
      const v = params.get(keep);
      if (v) next.set(keep, v);
    }
    commit(next);
  }, [params, commit]);

  return { params, values, toggle, set, clearAll, pending };
}
