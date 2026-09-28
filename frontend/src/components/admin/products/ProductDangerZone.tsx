"use client";

import type { AdminProductDetailDTO } from "@wovenwhale/backend/contracts";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api/client";
import { useAction, useCan } from "../AdminContext";
import { Panel } from "../ui/Panel";
import { ProductStatusBadge } from "../ui/StatusBadges";
import { ArchiveDialog, DeleteDialog, RestoreDialog } from "./LifecycleDialogs";
import styles from "./ProductDangerZone.module.css";

/** Product lifecycle: publish or unpublish, archive, restore, and permanent delete only when nothing refers to it. */
export function ProductDangerZone({ product }: { product: AdminProductDetailDTO }) {
  const canManage = useCan("products.manage");
  const { run, pending } = useAction();
  const [dialog, setDialog] = useState<"archive" | "restore" | "delete" | null>(null);
  if (!canManage) return null;

  return (
    <Panel title="Status and lifecycle" actions={<ProductStatusBadge status={product.status} />}>
      <div className={styles.rows}>
        {product.status !== "ARCHIVED" && (
          <div className={styles.row}>
            <p className={styles.text}>
              {product.status === "ACTIVE"
                ? "Active: customers can find and buy it. Switch to draft to hide it while you make changes."
                : "Draft: hidden from the store. Publish it once it has sizes, stock and photos."}
            </p>
            <Button
              size="sm"
              variant="secondary"
              loading={pending}
              onClick={() =>
                run(
                  () =>
                    api(`/admin/catalog/products/${product.id}/status`, {
                      method: "PATCH",
                      body: { isActive: product.status !== "ACTIVE" },
                    }),
                  product.status === "ACTIVE" ? "Moved to draft" : "Product is live",
                )
              }
            >
              {product.status === "ACTIVE" ? "Move to draft" : "Publish"}
            </Button>
          </div>
        )}
        {product.status === "ARCHIVED" ? (
          <>
            <div className={styles.row}>
              <p className={styles.text}>Archived: not in the store and not editable. Past orders still show it.</p>
              <Button size="sm" onClick={() => setDialog("restore")}>
                Restore
              </Button>
            </div>
            {product.deletable && (
              <div className={styles.row}>
                <p className={styles.text}>Never ordered and no stock history, so it can be deleted permanently.</p>
                <Button size="sm" variant="danger" onClick={() => setDialog("delete")}>
                  Delete permanently
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className={styles.row}>
            <p className={styles.text}>Archiving retires the product: it leaves the store, and past orders stay intact.</p>
            <Button size="sm" variant="danger" onClick={() => setDialog("archive")}>
              Archive product
            </Button>
          </div>
        )}
      </div>
      {dialog === "archive" && <ArchiveDialog product={product} onClose={() => setDialog(null)} />}
      {dialog === "restore" && <RestoreDialog product={product} onClose={() => setDialog(null)} />}
      {dialog === "delete" && <DeleteDialog product={product} onClose={() => setDialog(null)} />}
    </Panel>
  );
}
