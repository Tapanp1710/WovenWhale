"use client";

import type { AdminProductDetailDTO } from "@wovenwhale/backend/contracts";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { formatINR } from "@/lib/format";
import { useCan } from "../AdminContext";
import { LedgerDrawer } from "../inventory/LedgerDrawer";
import { StockDialog } from "../inventory/StockDialog";
import { Badge } from "../ui/Badge";
import { Panel } from "../ui/Panel";
import { cell, Table } from "../ui/Table";
import { stockVariants } from "./ProductRowActions";
import { VariantDialog } from "./VariantDialog";

type Variant = AdminProductDetailDTO["variants"][number];

export function VariantsEditor({ product }: { product: AdminProductDetailDTO }) {
  const canManage = useCan("products.manage") && product.status !== "ARCHIVED";
  const canStock = useCan("inventory.manage") && product.status !== "ARCHIVED";
  const canHistory = useCan("inventory.view");
  const [stock, setStock] = useState<{ mode: "restock" | "adjust" | "history"; variantId: string } | null>(null);
  // `undefined` = closed, `null` = adding a new size.
  const [editing, setEditing] = useState<Variant | null | undefined>(undefined);
  const nextSort = Math.max(0, ...product.variants.map((v) => v.sortOrder)) + 1;

  return (
    <Panel
      flush={product.variants.length > 0}
      title="Sizes and stock"
      description="Stock is kept per size. Restocks and adjustments are recorded in each size's stock history."
      actions={
        canManage && (
          <Button size="sm" variant="secondary" onClick={() => setEditing(null)} icon={<Plus size={15} aria-hidden="true" />}>
            Add size
          </Button>
        )
      }
    >
      {product.variants.length ? (
        <Table label="Sizes" minWidth={860}>
          <thead>
            <tr>
              <th scope="col">Size</th>
              <th scope="col">SKU</th>
              <th scope="col" className={cell.num}>
                Price
              </th>
              <th scope="col" className={cell.num}>
                On hand
              </th>
              <th scope="col" className={cell.num}>
                Reserved
              </th>
              <th scope="col" className={cell.num}>
                Available
              </th>
              <th scope="col">Status</th>
              <th scope="col" className={cell.actions}>
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {product.variants.map((v) => (
              <tr key={v.id}>
                <td className={cell.strong}>
                  {v.size}
                  {v.color && <span className={cell.sub}>{v.color}</span>}
                </td>
                <td className={cell.muted}>{v.sku}</td>
                <td className={cell.num}>
                  {formatINR(v.pricePaise)}
                  {v.pricePaiseOverride != null && <span className={cell.sub}>Override</span>}
                </td>
                <td className={cell.num}>{v.onHand}</td>
                <td className={cell.num}>{v.reserved}</td>
                <td className={`${cell.num} ${cell.strong}`}>
                  {v.available}
                  <span className={cell.sub}>low at {v.lowStockThreshold}</span>
                </td>
                <td>
                  {!v.isActive ? (
                    <Badge>Inactive</Badge>
                  ) : !v.inStock ? (
                    <Badge tone="danger">Out of stock</Badge>
                  ) : v.lowStock ? (
                    <Badge tone="warning">Low stock</Badge>
                  ) : (
                    <Badge tone="success">In stock</Badge>
                  )}
                </td>
                <td className={cell.actions}>
                  {canStock && v.isActive && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setStock({ mode: "restock", variantId: v.id })}
                        aria-label={`Restock size ${v.size}`}
                      >
                        Restock
                      </Button>{" "}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setStock({ mode: "adjust", variantId: v.id })}
                        aria-label={`Adjust stock for size ${v.size}`}
                      >
                        Adjust
                      </Button>{" "}
                    </>
                  )}
                  {canHistory && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setStock({ mode: "history", variantId: v.id })}
                      aria-label={`Stock history for size ${v.size}`}
                    >
                      History
                    </Button>
                  )}{" "}
                  {canManage && (
                    <Button size="sm" variant="ghost" onClick={() => setEditing(v)} aria-label={`Edit size ${v.size}`}>
                      Edit
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <p>No sizes yet. Add at least one size so customers can buy this product.</p>
      )}
      {stock && stock.mode !== "history" && (
        <StockDialog
          mode={stock.mode}
          productName={product.name}
          variants={stockVariants(product)}
          initialVariantId={stock.variantId}
          onClose={() => setStock(null)}
        />
      )}
      {stock?.mode === "history" && (
        <LedgerDrawer
          title={product.name}
          sizes={[
            ...product.variants.filter((v) => v.id === stock.variantId),
            ...product.variants.filter((v) => v.id !== stock.variantId),
          ].map((v) => ({ variantId: v.id, label: `Size ${v.size} (${v.sku}): ${v.onHand} on hand` }))}
          onClose={() => setStock(null)}
        />
      )}
      {editing !== undefined && (
        <VariantDialog
          key={editing?.id ?? "new"}
          open
          onOpenChange={(o) => !o && setEditing(undefined)}
          productId={product.id}
          productSku={product.sku}
          variant={editing}
          nextSort={nextSort}
        />
      )}
    </Panel>
  );
}
