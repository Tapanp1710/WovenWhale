"use client";

import type { InventoryRowDTO, InventoryTxnDTO } from "@wovenwhale/backend/contracts";
import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/format";
import { humanize } from "../labels";
import styles from "./LedgerDrawer.module.css";

const signed = (n: number) => (n > 0 ? `+${n}` : n === 0 ? "0" : `−${Math.abs(n)}`);

/** Every stock movement for one size, newest first. */
export function LedgerDrawer({ row, onClose }: { row: InventoryRowDTO; onClose: () => void }) {
  const [txns, setTxns] = useState<InventoryTxnDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    api<InventoryTxnDTO[]>(`/admin/inventory/${row.variantId}/transactions`, { signal: ctrl.signal })
      .then(setTxns)
      .catch((e: unknown) => {
        if ((e as Error).name !== "AbortError") setError(errorMessage(e));
      });
    return () => ctrl.abort();
  }, [row.variantId]);

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="Stock history"
      description={`${row.productName}, size ${row.size} (${row.sku})`}
      width="min(520px, 100vw)"
    >
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
        <ol className={styles.list}>
          {txns.map((t) => (
            <li key={t.id} className={styles.txn}>
              <div className={styles.head}>
                <span className={styles.type}>{humanize(t.type)}</span>
                <span className={styles.delta}>
                  {t.onHandDelta !== 0 && (
                    <span className={t.onHandDelta > 0 ? styles.up : styles.down}>{signed(t.onHandDelta)} on hand</span>
                  )}
                  {t.reservedDelta !== 0 && <span>{signed(t.reservedDelta)} reserved</span>}
                </span>
              </div>
              <p className={styles.meta}>
                {formatDateTime(t.createdAt)} · {t.actor ?? (t.orderNumber ? `Order ${t.orderNumber}` : "System")} · after: {t.onHandAfter}{" "}
                on hand, {t.reservedAfter} reserved
              </p>
              {t.note && <p className={styles.note}>{t.note}</p>}
            </li>
          ))}
        </ol>
      )}
    </Sheet>
  );
}
