import type { LowStockRowDTO } from "@wovenwhale/backend/contracts";
import Link from "next/link";
import { cell, Table } from "../ui/Table";

export function LowStockTable({ rows }: { rows: LowStockRowDTO[] }) {
  return (
    <Table label="Low-stock variants" minWidth={560}>
      <thead>
        <tr>
          <th scope="col">Product</th>
          <th scope="col">Size</th>
          <th scope="col">SKU</th>
          <th scope="col" className={cell.num}>
            Available
          </th>
          <th scope="col" className={cell.num}>
            Threshold
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.variantId}>
            <td>
              <Link href={`/admin/inventory?q=${encodeURIComponent(r.sku)}`} className={cell.link}>
                {r.productName}
              </Link>
            </td>
            <td>{r.size}</td>
            <td className={cell.muted}>{r.sku}</td>
            <td className={`${cell.num} ${cell.strong}`}>{r.available}</td>
            <td className={`${cell.num} ${cell.muted}`}>{r.lowStockThreshold}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
