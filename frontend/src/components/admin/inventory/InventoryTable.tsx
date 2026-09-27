"use client";

import type { InventoryRowDTO } from "@wovenwhale/backend/contracts";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useCan } from "../AdminContext";
import { Badge } from "../ui/Badge";
import { cell, Table } from "../ui/Table";
import { AdjustDialog } from "./AdjustDialog";
import { LedgerDrawer } from "./LedgerDrawer";

export function InventoryTable({ rows }: { rows: InventoryRowDTO[] }) {
  const canManage = useCan("inventory.manage");
  const canProducts = useCan("products.view");
  const [adjusting, setAdjusting] = useState<InventoryRowDTO | null>(null);
  const [history, setHistory] = useState<InventoryRowDTO | null>(null);

  return (
    <>
      <Table label="Stock by size" minWidth={900}>
        <thead>
          <tr>
            <th scope="col">Product</th>
            <th scope="col">Size</th>
            <th scope="col" className={cell.num}>
              On hand
            </th>
            <th scope="col" className={cell.num}>
              Reserved
            </th>
            <th scope="col" className={cell.num}>
              Available
            </th>
            <th scope="col" className={cell.num}>
              Threshold
            </th>
            <th scope="col">Status</th>
            <th scope="col" className={cell.actions}>
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const low = r.available <= r.lowStockThreshold;
            return (
              <tr key={r.variantId}>
                <td>
                  <div className={cell.media}>
                    {r.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.imageUrl} alt="" className={cell.thumb} loading="lazy" />
                    ) : (
                      <span className={cell.thumb} />
                    )}
                    <span>
                      {canProducts ? (
                        <Link href={`/admin/products/${r.productId}`} className={cell.link}>
                          {r.productName}
                        </Link>
                      ) : (
                        <span className={cell.strong}>{r.productName}</span>
                      )}
                      <span className={cell.sub}>{r.sku}</span>
                    </span>
                  </div>
                </td>
                <td className={cell.strong}>{r.size}</td>
                <td className={cell.num}>{r.onHand}</td>
                <td className={cell.num}>{r.reserved}</td>
                <td className={`${cell.num} ${cell.strong}`}>{r.available}</td>
                <td className={`${cell.num} ${cell.muted}`}>{r.lowStockThreshold}</td>
                <td>
                  {!r.isActive ? (
                    <Badge>Inactive</Badge>
                  ) : r.available <= 0 ? (
                    <Badge tone="danger">Out of stock</Badge>
                  ) : low ? (
                    <Badge tone="warning">Low stock</Badge>
                  ) : (
                    <Badge tone="success">In stock</Badge>
                  )}
                </td>
                <td className={cell.actions}>
                  <Button size="sm" variant="ghost" onClick={() => setHistory(r)} aria-label={`Stock history for ${r.sku}`}>
                    History
                  </Button>
                  {canManage && (
                    <Button size="sm" variant="secondary" onClick={() => setAdjusting(r)} aria-label={`Adjust stock for ${r.sku}`}>
                      Adjust
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      {adjusting && <AdjustDialog row={adjusting} onClose={() => setAdjusting(null)} />}
      {history && <LedgerDrawer row={history} onClose={() => setHistory(null)} />}
    </>
  );
}
