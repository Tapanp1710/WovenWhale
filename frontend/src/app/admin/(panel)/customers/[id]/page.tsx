import type { AdminCustomerDetailDTO } from "@wovenwhale/backend/contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityFeed, WhatsAppLog } from "@/components/admin/customers/ActivityFeed";
import { CustomerControls } from "@/components/admin/customers/CustomerControls";
import { KpiStrip } from "@/components/admin/dashboard/KpiStrip";
import { humanize } from "@/components/admin/labels";
import { RefundsTable } from "@/components/admin/orders/RefundsTable";
import { ReturnsTable } from "@/components/admin/orders/ReturnsTable";
import { adminWith } from "@/components/admin/server";
import { Badge } from "@/components/admin/ui/Badge";
import { NoAccess } from "@/components/admin/ui/NoAccess";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Panel } from "@/components/admin/ui/Panel";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/admin/ui/StatusBadges";
import { cell, Table } from "@/components/admin/ui/Table";
import { sessionApiOrNull } from "@/lib/api/server";
import { formatDate, formatDateTime, formatINR, formatPhone } from "@/lib/format";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await adminWith("customers.view"))) return <NoAccess what="customers" />;
  const { id } = await params;
  const c = await sessionApiOrNull<AdminCustomerDetailDTO>(`/admin/customers/${encodeURIComponent(id)}`);
  if (!c) notFound();

  return (
    <div className={styles.page}>
      <PageHeader
        back={{ href: "/admin/customers", label: "Customers" }}
        title={c.fullName ?? "Unnamed customer"}
        meta={c.isBlocked ? <Badge tone="danger">Blocked</Badge> : null}
        description={
          <>
            <a href={`tel:${c.phone}`}>{formatPhone(c.phone)}</a>
            {c.email && ` · ${c.email}`} · WhatsApp updates {c.whatsappOptIn ? "on" : "off"} · Marketing {c.marketingOptIn ? "on" : "off"}
          </>
        }
        actions={<CustomerControls customer={c} />}
      />

      <KpiStrip
        label="Customer summary"
        items={[
          { label: "Orders", value: c.orderCount },
          { label: "Total spent", value: formatINR(c.totalSpentPaise) },
          { label: "Average order", value: formatINR(c.averageOrderValuePaise) },
          { label: "Customer since", value: formatDate(c.createdAt) },
          { label: "Came from", value: humanize(c.acquisitionSource ?? "direct") },
        ]}
      />

      <div className={styles.layout}>
        <div className={styles.main}>
          <Panel flush title="Orders">
            {c.orders.length ? (
              <Table label="Orders" minWidth={620}>
                <thead>
                  <tr>
                    <th scope="col">Order</th>
                    <th scope="col">Placed</th>
                    <th scope="col" className={cell.num}>
                      Total
                    </th>
                    <th scope="col">Payment</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {c.orders.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <Link href={`/admin/orders/${o.id}`} className={cell.link}>
                          {o.orderNumber}
                        </Link>
                        <span className={cell.sub}>
                          {o.itemCount} {o.itemCount === 1 ? "item" : "items"}
                        </span>
                      </td>
                      <td className={cell.nowrap}>{formatDateTime(o.placedAt)}</td>
                      <td className={`${cell.num} ${cell.strong}`}>{formatINR(o.totalPaise)}</td>
                      <td>
                        <PaymentStatusBadge status={o.paymentStatus} />
                      </td>
                      <td>
                        <OrderStatusBadge status={o.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <p className={styles.none}>No orders yet.</p>
            )}
          </Panel>

          {c.returns.length > 0 && (
            <Panel flush title="Returns">
              <ReturnsTable rows={c.returns} showOrder />
            </Panel>
          )}
          {c.refunds.length > 0 && (
            <Panel flush title="Refunds">
              <RefundsTable refunds={c.refunds} />
            </Panel>
          )}

          <Panel flush title="Checkout history" description="Recovery status is tracked on the abandoned checkouts page.">
            {c.checkouts.length ? (
              <Table label="Checkouts" minWidth={520}>
                <thead>
                  <tr>
                    <th scope="col">Last activity</th>
                    <th scope="col">Status</th>
                    <th scope="col">Recovery</th>
                    <th scope="col" className={cell.num}>
                      Value
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {c.checkouts.map((k) => (
                    <tr key={k.id}>
                      <td className={cell.nowrap}>{formatDateTime(k.lastActivityAt)}</td>
                      <td>
                        <Badge tone={k.status === "CONVERTED" ? "success" : k.status === "ABANDONED" ? "warning" : "neutral"}>
                          {humanize(k.status)}
                        </Badge>
                      </td>
                      <td className={cell.muted}>{humanize(k.recoveryStatus)}</td>
                      <td className={cell.num}>{formatINR(k.totalPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <p className={styles.none}>No checkouts started.</p>
            )}
          </Panel>

          <Panel title="Recent activity">
            <ActivityFeed events={c.events} />
          </Panel>
        </div>

        <div className={styles.side}>
          <Panel title="Addresses">
            {c.addresses.length ? (
              <ul className={styles.addresses}>
                {c.addresses.map((a) => (
                  <li key={a.id}>
                    <address className={styles.address}>
                      <strong>{a.fullName}</strong> {a.isDefault && <Badge tone="info">Default</Badge>}
                      <br />
                      {[a.line1, a.line2, a.area].filter(Boolean).join(", ")}
                      <br />
                      {a.city}, {a.state} {a.pincode}
                      <br />
                      {formatPhone(a.phone)}
                    </address>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>No saved addresses.</p>
            )}
          </Panel>
          <Panel title="Bag">
            {c.cart.length ? (
              <ul className={styles.plain}>
                {c.cart.map((l, i) => (
                  <li key={i}>
                    {l.name} ({l.size}) × {l.quantity}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>Empty.</p>
            )}
          </Panel>
          <Panel title="Wishlist">
            {c.wishlist.length ? (
              <ul className={styles.plain}>
                {c.wishlist.map((w) => (
                  <li key={w.productId}>
                    <Link href={`/admin/products/${w.productId}`}>{w.name}</Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>Empty.</p>
            )}
          </Panel>
          <Panel title="WhatsApp messages">
            <WhatsAppLog messages={c.whatsappMessages} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
