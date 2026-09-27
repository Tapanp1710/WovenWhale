"use client";

import type { AdminProductDetailDTO } from "@wovenwhale/backend/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api/client";
import { useAction, useCan } from "../AdminContext";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Panel } from "../ui/Panel";
import styles from "./ProductDangerZone.module.css";

export function ProductDangerZone({ product }: { product: AdminProductDetailDTO }) {
  const router = useRouter();
  const canManage = useCan("products.manage");
  const { run, pending } = useAction();
  const [confirming, setConfirming] = useState(false);
  if (!canManage) return null;

  return (
    <Panel title="Availability">
      <div className={styles.rows}>
        <div className={styles.row}>
          <p className={styles.text}>
            {product.isActive
              ? "Deactivating hides the product from the store but keeps it here for editing."
              : "This product is hidden from the store."}
          </p>
          <Button
            size="sm"
            variant="secondary"
            loading={pending}
            onClick={() =>
              run(
                () => api(`/admin/catalog/products/${product.id}/status`, { method: "PATCH", body: { isActive: !product.isActive } }),
                product.isActive ? "Product hidden from the store" : "Product is live",
              )
            }
          >
            {product.isActive ? "Deactivate" : "Activate"}
          </Button>
        </div>
        <div className={styles.row}>
          <p className={styles.text}>
            Deleting removes it from the catalog. Past orders keep their records, and the slug and SKU stay reserved.
          </p>
          <Button size="sm" variant="danger" onClick={() => setConfirming(true)}>
            Delete product
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete ${product.name}?`}
        description="The product disappears from the store and this list. This can't be undone here."
        confirmLabel="Delete product"
        onConfirm={async () => {
          const ok = await run(() => api(`/admin/catalog/products/${product.id}`, { method: "DELETE" }), "Product deleted");
          if (ok) router.push("/admin/products");
          return ok;
        }}
      />
    </Panel>
  );
}
