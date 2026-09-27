import { RETURN_TYPE_LABELS, type AdminReturnRowDTO } from "@wovenwhale/backend/contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { can, humanize } from "@/components/admin/labels";
import { RefundsTable } from "@/components/admin/orders/RefundsTable";
import { ReturnActions } from "@/components/admin/returns/ReturnActions";
import { adminWith } from "@/components/admin/server";
import { Facts } from "@/components/admin/ui/Facts";
import { NoAccess } from "@/components/admin/ui/NoAccess";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Panel } from "@/components/admin/ui/Panel";
import { ReturnStatusBadge } from "@/components/admin/ui/StatusBadges";
import { cell, Table } from "@/components/admin/ui/Table";
import { sessionApiOrNull } from "@/lib/api/server";
import { formatDateTime, formatINR, formatPhone } from "@/lib/format";
import styles from "../../orders/[id]/page.module.css";

export const metadata: Metadata = { title: "Return" };

export default async function ReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await adminWith("returns.view");
  if (!admin) return <NoAccess what="returns" />;
  const { id } = await params;
  const r = await sessionApiOrNull<AdminReturnRowDTO>(`/admin/returns/${encodeURIComponent(id)}`);
  if (!r) notFound();

  return (
    <>
      <PageHeader
        back={{ href: "/admin/returns", label: "Returns" }}
        title={`${RETURN_TYPE_LABELS[r.type]} ${r.returnNumber}`}
        meta={<ReturnStatusBadge status={r.status} />}
        description={`Requested ${formatDateTime(r.createdAt)} · ${humanize(r.reason)}`}
      />
      <ReturnActions ret={r} />
      <div className={styles.layout}>
        <div className={styles.main}>
          <Panel flush title="Items">
            <Table label="Returned items" minWidth={480}>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Size</th>
                  <th scope="col" className={cell.num}>
                    Qty
                  </th>
                  <th scope="col">Exchange for</th>
                </tr>
              </thead>
              <tbody>
                {r.items.map((i) => (
                  <tr key={i.orderItemId}>
                    <td className={cell.strong}>{i.productName}</td>
                    <td>{i.size}</td>
                    <td className={cell.num}>{i.quantity}</td>
                    <td>{i.exchangeSize ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Panel>
          <Panel title="Customer's message">
            <Facts
              items={[
                ["Reason", humanize(r.reason)],
                ["Note", r.customerNote ?? "No note"],
                ["We asked", r.infoRequest],
                ["Admin note", r.adminNote],
              ]}
            />
          </Panel>
          {r.refunds.length > 0 && (
            <Panel flush title="Refunds">
              <RefundsTable refunds={r.refunds} />
            </Panel>
          )}
        </div>
        <div className={styles.side}>
          <Panel title="Order">
            <Facts
              items={[
                ["Order", can(admin, "orders.view") ? <Link href={`/admin/orders/${r.orderId}`}>{r.orderNumber}</Link> : r.orderNumber],
                ["Customer", r.customerName ?? "Unnamed customer"],
                ["Phone", <a href={`tel:${r.customerPhone}`}>{formatPhone(r.customerPhone)}</a>],
                ["Paid by", r.paymentMethod === "COD" ? "Cash on delivery" : "Prepaid"],
                ["Refundable", formatINR(r.refundablePaise)],
                ["Refunded", r.refundPaise !== null ? formatINR(r.refundPaise) : null],
              ]}
            />
          </Panel>
        </div>
      </div>
    </>
  );
}
