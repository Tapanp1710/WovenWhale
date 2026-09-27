"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import styles from "./FilterForm.module.css";

/**
 * Filters live in the URL: submitting writes the non-empty fields to the query
 * string (resetting to page 1); selects and dates apply as soon as they change.
 * Render with `key` set to the current params so defaults follow navigation.
 */
export function FilterForm({ children, hasFilters }: { children: ReactNode; hasFilters: boolean }) {
  const router = useRouter();
  const pathname = usePathname();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const qs = new URLSearchParams();
    for (const [key, value] of new FormData(e.currentTarget)) {
      if (typeof value === "string" && value.trim()) qs.set(key, value.trim());
    }
    const s = qs.toString();
    router.push(s ? `${pathname}?${s}` : pathname);
  }

  function change(e: ChangeEvent<HTMLFormElement>) {
    const t = e.target as unknown as HTMLInputElement | HTMLSelectElement;
    if (t.tagName === "SELECT" || t.type === "date" || t.type === "checkbox") e.currentTarget.requestSubmit();
  }

  return (
    <form className={styles.form} onSubmit={submit} onChange={change} role="search">
      <div className={styles.fields}>{children}</div>
      <div className={styles.buttons}>
        <Button type="submit" size="sm" icon={<Search size={15} aria-hidden="true" />}>
          Apply
        </Button>
        {hasFilters && (
          <Link href={pathname} className={styles.clear}>
            Clear filters
          </Link>
        )}
      </div>
    </form>
  );
}
