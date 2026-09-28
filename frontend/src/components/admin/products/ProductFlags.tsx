"use client";

import type { AdminProductRowDTO } from "@wovenwhale/backend/contracts";
import { useState } from "react";
import { api } from "@/lib/api/client";
import { useAction, useCan } from "../AdminContext";
import { Switch } from "../ui/Switch";
import styles from "./ProductFlags.module.css";

/**
 * Storefront placement switches. Visibility itself is the product's Status
 * (Active / Draft / Archived), not a switch here.
 */
export const FLAGS = [
  ["isFeatured", "Featured", "Shown in the Featured section of the homepage and first in “Featured” sorting."],
  ["isBestSeller", "Best seller", "Adds the Best seller badge and ranks higher in the Best sellers section and search."],
  ["isNewArrival", "New", "Adds the New badge and places it in the New arrivals section of the homepage."],
] as const;
type Flag = (typeof FLAGS)[number][0];

/** Column header aligned with the switches below it; each label explains itself on hover and to screen readers. */
export function ProductFlagsHeader() {
  return (
    <span className={`${styles.flags} ${styles.header}`}>
      {FLAGS.map(([flag, label, help]) => (
        <span key={flag} title={help}>
          {label}
          <span className="visually-hidden">: {help}</span>
        </span>
      ))}
    </span>
  );
}

/** Inline placement toggles; optimistic, reverted if the API refuses. */
export function ProductFlags({ product }: { product: AdminProductRowDTO }) {
  const canManage = useCan("products.manage");
  const { run } = useAction();
  const [flags, setFlags] = useState<Record<Flag, boolean>>(product);
  const [busy, setBusy] = useState<Flag | null>(null);

  async function toggle(flag: Flag, label: string) {
    const next = !flags[flag];
    setBusy(flag);
    setFlags((f) => ({ ...f, [flag]: next }));
    const ok = await run(
      () => api(`/admin/catalog/products/${product.id}/status`, { method: "PATCH", body: { [flag]: next } }),
      `${product.name}: ${label.toLowerCase()} ${next ? "on" : "off"}`,
    );
    if (!ok) setFlags((f) => ({ ...f, [flag]: !next }));
    setBusy(null);
  }

  return (
    <div className={styles.flags}>
      {FLAGS.map(([flag, label, help]) => (
        <Switch
          key={flag}
          checked={flags[flag]}
          label={`${label}: ${product.name}`}
          title={help}
          disabled={!canManage || busy !== null || product.status === "ARCHIVED"}
          onClick={() => toggle(flag, label)}
        />
      ))}
    </div>
  );
}
