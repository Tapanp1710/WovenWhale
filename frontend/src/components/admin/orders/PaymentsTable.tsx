import type { AdminOrderDetailDTO } from "@wovenwhale/backend/contracts";
import { formatDateTime, formatINR } from "@/lib/format";
import { humanize } from "../labels";
import { Badge } from "../ui/Badge";
import { PaymentStatusBadge } from "../ui/StatusBadges";
import { cell, Table } from "../ui/Table";

/** Every payment attempt, including failures and duplicate captures. */
export function PaymentsTable({ payments }: { payments: AdminOrderDetailDTO["payments"] }) {
  return (
    <Table label="Payment attempts" minWidth={640}>
      <thead>
        <tr>
          <th scope="col">When</th>
          <th scope="col">Provider</th>
          <th scope="col">Reference</th>
          <th scope="col" className={cell.num}>
            Amount
          </th>
          <th scope="col">Status</th>
        </tr>
      </thead>
      <tbody>
        {payments.map((p) => (
          <tr key={p.id}>
            <td className={cell.nowrap}>{formatDateTime(p.createdAt)}</td>
            <td>{p.provider === "cod" ? "Cash on delivery" : humanize(p.provider)}</td>
            <td className={cell.muted}>
              {p.providerPaymentId ?? p.providerOrderId ?? "—"}
              {p.failureReason && <span className={cell.sub}>{p.failureReason}</span>}
            </td>
            <td className={cell.num}>{formatINR(p.amountPaise)}</td>
            <td>
              <PaymentStatusBadge status={p.status} /> {p.isDuplicate && <Badge tone="warning">Duplicate</Badge>}
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
