"use client";

import type { InventoryTxnDTO, InventoryTxnType } from "@wovenwhale/backend/contracts";
import { useEffect, useState } from "react";
import { SelectField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/format";
import styles from "./LedgerDrawer.module.css";

const signed = (n: number) => (n > 0 ? `+${n}` : n === 0 ? "0" : `−${Math.abs(n)}`);

const TXN_LABELS: Record<InventoryTxnType, string> = {
  STOCK_IN: "Restock",
  ORDER_RESERVED: "Reserved for order",
  ORDER_CONFIRMED: "Sold",
  ORDER_CANCELLED: "Order cancelled",
  RETURN_RECEIVED: "Return received",
  MANUAL_ADJUSTMENT: "Adjustment",
  STOCK_CORRECTION: "Stock count correction",
};

export interface LedgerSize {
  variantId: string;
  label: string;
}

/** Every stock movement for one size, newest first, straight from the inventory ledger. */
export function LedgerDrawer({ title, sizes, onClose }: { title: string; sizes: LedgerSize[]; onClose: () => void }) {
  const [variantId, setVariantId] = useState(sizes[0]?.variantId ?? "");
  const [txns, setTxns] = useState<InventoryTxnDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!variantId) return;
    const ctrl = new AbortController();
    setTxns(null);
    setError(null);
    api<InventoryTxnDTO[]>(`/admin/inventory/${variantId}/transactions`, { signal: ctrl.signal })
      .then(setTxns)
      .catch((e: unknown) => {
        if ((e as Error).name !== "AbortError") setError(errorMessage(e));
      });
    return () => ctrl.abort();
  }, [variantId]);

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="Stock history"
      description={sizes.length === 1 ? sizes[0]!.label : title}
      width="min(520px, 100vw)"
    >
      {sizes.length > 1 && (
        <div className={styles.picker}>
          <SelectField label="Size" value={variantId} onChange={(e) => setVariantId(e.target.value)}>
            {sizes.map((s) => (
              <option key={s.variantId} value={s.variantId}>
                {s.label}
              </option>
            ))}
          </SelectField>
        </div>
      )}
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : !txns ? (
        <div className={styles.loading} aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} height="3rem" />
          ))}
        </div>
      ) : !txns.length ? (
        <p className={styles.empty}>No movements recorded yet.</p>
      ) : (
        <ol className={styles.list} aria-label="Stock movements">
          {txns.map((t) => (
            <li key={t.id} className={styles.txn}>
              <div className={styles.head}>
                <span className={styles.type}>{TXN_LABELS[t.type] ?? t.type}</span>
                <span className={styles.delta}>
                  {t.onHandDelta !== 0 && (
                    <span className={t.onHandDelta > 0 ? styles.up : styles.down}>
                      {signed(t.onHandDelta)} ({t.onHandAfter - t.onHandDelta} → {t.onHandAfter})
                    </span>
                  )}
                  {t.reservedDelta !== 0 && <span>{signed(t.reservedDelta)} reserved</span>}
                </span>
              </div>
              {t.note && <p className={styles.note}>{t.note}</p>}
              <p className={styles.meta}>
                {formatDateTime(t.createdAt)} · {t.actor ?? (t.orderNumber ? `Order ${t.orderNumber}` : "System")}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Sheet>
  );
}
