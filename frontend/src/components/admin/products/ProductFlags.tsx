"use client";

import type { AdminProductRowDTO } from "@wovenwhale/backend/contracts";
import { useState } from "react";
import { api } from "@/lib/api/client";
import { useAction, useCan } from "../AdminContext";
import { Switch } from "../ui/Switch";
import styles from "./ProductFlags.module.css";

export const FLAGS = [
  ["isActive", "Active"],
  ["isFeatured", "Featured"],
  ["isBestSeller", "Best seller"],
  ["isNewArrival", "New arrival"],
] as const;
type Flag = (typeof FLAGS)[number][0];

/** Column header aligned with the switches below it. */
export function ProductFlagsHeader() {
  return (
    <span className={`${styles.flags} ${styles.header}`}>
      {FLAGS.map(([flag, label]) => (
        <span key={flag}>{label}</span>
      ))}
    </span>
  );
}

/** Inline merchandising toggles; optimistic, reverted if the API refuses. */
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
      {FLAGS.map(([flag, label]) => (
        <Switch
          key={flag}
          checked={flags[flag]}
          label={`${label}: ${product.name}`}
          title={label}
          disabled={!canManage || busy !== null}
          onClick={() => toggle(flag, label)}
        />
      ))}
    </div>
  );
}
