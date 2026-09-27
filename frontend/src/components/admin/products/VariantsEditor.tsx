"use client";

import type { AdminProductDetailDTO } from "@wovenwhale/backend/contracts";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { formatINR } from "@/lib/format";
import { useCan } from "../AdminContext";
import { Badge } from "../ui/Badge";
import { Panel } from "../ui/Panel";
import { cell, Table } from "../ui/Table";
import { VariantDialog } from "./VariantDialog";

type Variant = AdminProductDetailDTO["variants"][number];

export function VariantsEditor({ product }: { product: AdminProductDetailDTO }) {
  const canManage = useCan("products.manage");
  // `undefined` = closed, `null` = adding a new size.
  const [editing, setEditing] = useState<Variant | null | undefined>(undefined);
  const nextSort = Math.max(0, ...product.variants.map((v) => v.sortOrder)) + 1;

  return (
    <Panel
      flush={product.variants.length > 0}
      title="Sizes and stock"
      description="Stock changes go through Inventory so every movement is recorded."
      actions={
        canManage && (
          <Button size="sm" variant="secondary" onClick={() => setEditing(null)} icon={<Plus size={15} aria-hidden="true" />}>
            Add size
          </Button>
        )
      }
    >
      {product.variants.length ? (
        <Table label="Sizes" minWidth={680}>
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
                <td className={`${cell.num} ${cell.strong}`}>{v.available}</td>
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
                  <Link href={`/admin/inventory?q=${encodeURIComponent(v.sku)}`} className={cell.link}>
                    Stock
                  </Link>{" "}
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
