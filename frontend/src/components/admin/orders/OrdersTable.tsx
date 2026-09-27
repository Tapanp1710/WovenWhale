import type { AdminOrderRowDTO } from "@wovenwhale/backend/contracts";
import Link from "next/link";
import { formatDateTime, formatINR, formatPhone } from "@/lib/format";
import { OrderStatusBadge, PaymentStatusBadge } from "../ui/StatusBadges";
import { cell, Table } from "../ui/Table";

export function OrdersTable({ rows }: { rows: AdminOrderRowDTO[] }) {
  return (
    <Table label="Orders" minWidth={960}>
      <thead>
        <tr>
          <th scope="col">Order</th>
          <th scope="col">Placed</th>
          <th scope="col">Customer</th>
          <th scope="col">Ship to</th>
          <th scope="col" className={cell.num}>
            Items
          </th>
          <th scope="col" className={cell.num}>
            Total
          </th>
          <th scope="col">Payment</th>
          <th scope="col">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((o) => (
          <tr key={o.id}>
            <td>
              <Link href={`/admin/orders/${o.id}`} className={cell.link}>
                {o.orderNumber}
              </Link>
            </td>
            <td className={cell.nowrap}>{formatDateTime(o.placedAt)}</td>
            <td>
              {o.customerName ?? "Guest"}
              <span className={cell.sub}>{formatPhone(o.customerPhone)}</span>
            </td>
            <td>
              {o.city}
              <span className={cell.sub}>{o.pincode}</span>
            </td>
            <td className={cell.num}>{o.itemCount}</td>
            <td className={`${cell.num} ${cell.strong}`}>{formatINR(o.totalPaise)}</td>
            <td>
              <PaymentStatusBadge status={o.paymentStatus} />
              <span className={cell.sub}>{o.paymentMethod === "COD" ? "Cash on delivery" : "Prepaid"}</span>
            </td>
            <td>
              <OrderStatusBadge status={o.status} />
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
