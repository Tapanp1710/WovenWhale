"use client";

import type { AdminProductDetailDTO, ProductStatus } from "@wovenwhale/backend/contracts";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { api } from "@/lib/api/client";
import { useAction, useCan } from "../AdminContext";
import { LedgerDrawer } from "../inventory/LedgerDrawer";
import { StockDialog } from "../inventory/StockDialog";
import { ActionMenu } from "../ui/ActionMenu";
import { ArchiveDialog, RestoreDialog } from "./LifecycleDialogs";
import styles from "./ProductRowActions.module.css";

type Panel = "restock" | "adjust" | "history" | "archive" | "restore";

export const stockVariants = (p: AdminProductDetailDTO) =>
  p.variants.filter((v) => v.isActive).map((v) => ({ variantId: v.id, size: v.size, sku: v.sku, onHand: v.onHand, reserved: v.reserved }));

/**
 * Explicit row actions: Edit and Restock up front, the rest in a menu.
 * Stock actions load the product's sizes when opened, so levels are current.
 */
export function ProductRowActions({ product }: { product: { id: string; name: string; status: ProductStatus } }) {
  const canEdit = useCan("products.manage");
  const canStock = useCan("inventory.manage");
  const canHistory = useCan("inventory.view");
  const { run } = useAction();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [detail, setDetail] = useState<AdminProductDetailDTO | null>(null);
  const [loading, setLoading] = useState<Panel | null>(null);
  const archived = product.status === "ARCHIVED";

  async function open(p: Panel) {
    if (p === "archive" || p === "restore") return setPanel(p);
    setLoading(p);
    const loaded = await run(() => api<AdminProductDetailDTO>(`/admin/catalog/products/${product.id}`));
    setLoading(null);
    if (loaded) {
      setDetail(loaded);
      setPanel(p);
    }
  }

  return (
    <div className={styles.actions} onClick={(e) => e.stopPropagation()}>
      <ButtonLink
        href={`/admin/products/${product.id}`}
        size="sm"
        variant="secondary"
        aria-label={`${canEdit ? "Edit" : "View"} ${product.name}`}
      >
        {canEdit && !archived ? "Edit" : "View"}
      </ButtonLink>
      {canStock && !archived && (
        <Button
          size="sm"
          variant="secondary"
          loading={loading === "restock"}
          onClick={() => open("restock")}
          aria-label={`Restock ${product.name}`}
        >
          Restock
        </Button>
      )}
      <ActionMenu
        label={`More actions for ${product.name}`}
        items={[
          { label: "Adjust stock", onSelect: () => open("adjust"), hidden: !canStock || archived },
          { label: "Stock history", onSelect: () => open("history"), hidden: !canHistory },
          { label: "Archive", onSelect: () => open("archive"), tone: "danger", hidden: !canEdit || archived },
          { label: "Restore", onSelect: () => open("restore"), hidden: !canEdit || !archived },
        ]}
      />

      {(panel === "restock" || panel === "adjust") && detail && (
        <StockDialog mode={panel} productName={product.name} variants={stockVariants(detail)} onClose={() => setPanel(null)} />
      )}
      {panel === "history" && detail && (
        <LedgerDrawer
          title={product.name}
          sizes={detail.variants.map((v) => ({ variantId: v.id, label: `Size ${v.size} (${v.sku}): ${v.onHand} on hand` }))}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "archive" && <ArchiveDialog product={product} onClose={() => setPanel(null)} />}
      {panel === "restore" && <RestoreDialog product={product} onClose={() => setPanel(null)} />}
    </div>
  );
}
