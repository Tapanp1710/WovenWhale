import { RETURN_TYPE_LABELS, type ReturnSummaryDTO } from "@wovenwhale/backend/contracts";
import Link from "next/link";
import { formatDate, formatINR } from "@/lib/format";
import { humanize } from "../labels";
import { ReturnStatusBadge } from "../ui/StatusBadges";
import { cell, Table } from "../ui/Table";

export function ReturnsTable({ rows, showOrder }: { rows: ReturnSummaryDTO[]; showOrder?: boolean }) {
  return (
    <Table label="Returns" minWidth={600}>
      <thead>
        <tr>
          <th scope="col">Return</th>
          {showOrder && <th scope="col">Order</th>}
          <th scope="col">Requested</th>
          <th scope="col">Type</th>
          <th scope="col">Items</th>
          <th scope="col" className={cell.num}>
            Refund
          </th>
          <th scope="col">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <Link href={`/admin/returns/${r.id}`} className={cell.link}>
                {r.returnNumber}
              </Link>
              <span className={cell.sub}>{humanize(r.reason)}</span>
            </td>
            {showOrder && <td>{r.orderNumber}</td>}
            <td className={cell.nowrap}>{formatDate(r.createdAt)}</td>
            <td>{RETURN_TYPE_LABELS[r.type]}</td>
            <td>
              {r.items.map((i) => (
                <span key={i.orderItemId} className={cell.sub}>
                  {i.productName} ({i.size}) × {i.quantity}
                  {i.exchangeSize ? `, exchange for ${i.exchangeSize}` : ""}
                </span>
              ))}
            </td>
            <td className={cell.num}>{r.refundPaise !== null ? formatINR(r.refundPaise) : "—"}</td>
            <td>
              <ReturnStatusBadge status={r.status} />
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
