"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Hidden convenience shortcut: typing the configured sequence anywhere on the
 * storefront (outside form fields) opens /admin/login.
 *
 * This is NOT authentication — the sequence ships in the page bundle and is
 * only a shortcut. The admin portal still requires credentials, RBAC and a
 * server-side session.
 */
export function AdminPortalShortcut({ sequence }: { sequence: string }) {
  const router = useRouter();

  useEffect(() => {
    if (!sequence) return;
    let typed = "";
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      typed = (typed + e.key).slice(-sequence.length);
      clearTimeout(timer);
      timer = setTimeout(() => (typed = ""), 2000);
      if (typed === sequence) {
        typed = "";
        router.push("/admin/login");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(timer);
    };
  }, [sequence, router]);

  return null;
}
