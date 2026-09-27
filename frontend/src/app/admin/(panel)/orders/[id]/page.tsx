import type { AdminOrderDetailDTO } from "@wovenwhale/backend/contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditTrail } from "@/components/admin/audit/AuditTrail";
import { can, riskLabel } from "@/components/admin/labels";
import { NotesPanel } from "@/components/admin/orders/NotesPanel";
import { OrderActions } from "@/components/admin/orders/OrderActions";
import { OrderItems } from "@/components/admin/orders/OrderItems";
import { OrderTimeline } from "@/components/admin/orders/OrderTimeline";
import { PaymentsTable } from "@/components/admin/orders/PaymentsTable";
import { RefundsTable } from "@/components/admin/orders/RefundsTable";
import { ReturnsTable } from "@/components/admin/orders/ReturnsTable";
import { ShipmentsList } from "@/components/admin/orders/ShipmentsList";
import { adminWith } from "@/components/admin/server";
import { Badge } from "@/components/admin/ui/Badge";
import { Facts } from "@/components/admin/ui/Facts";
import { NoAccess } from "@/components/admin/ui/NoAccess";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Panel } from "@/components/admin/ui/Panel";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/admin/ui/StatusBadges";
import { sessionApiOrNull } from "@/lib/api/server";
import { formatDate, formatDateTime, formatPhone } from "@/lib/format";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Order" };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await adminWith("orders.view");
  if (!admin) return <NoAccess what="orders" />;
  const { id } = await params;
  const order = await sessionApiOrNull<AdminOrderDetailDTO>(`/admin/orders/${encodeURIComponent(id)}`);
  if (!order) notFound();
  const a = order.shippingAddress;

  return (
    <>
      <PageHeader
        back={{ href: "/admin/orders", label: "Orders" }}
        title={`Order ${order.orderNumber}`}
        meta={
          <>
            <OrderStatusBadge status={order.status} />
            <PaymentStatusBadge status={order.paymentStatus} />
          </>
        }
        description={`Placed ${formatDateTime(order.placedAt)} · ${order.paymentMethod === "COD" ? "Cash on delivery" : "Prepaid"}${order.cancelReason ? ` · Cancelled: ${order.cancelReason}` : ""}`}
      />
      <OrderActions order={order} />

      <div className={styles.layout}>
        <div className={styles.main}>
          <Panel flush title={`Items (${order.itemCount})`}>
            <OrderItems order={order} />
          </Panel>
          <Panel title="Shipments">
            <ShipmentsList shipments={order.shipments} />
          </Panel>
          <Panel flush title="Payment attempts">
            <PaymentsTable payments={order.payments} />
          </Panel>
          {order.returns.length > 0 && (
            <Panel flush title="Returns">
              <ReturnsTable rows={order.returns} />
            </Panel>
          )}
          {order.refunds.length > 0 && (
            <Panel flush title="Refunds">
              <RefundsTable refunds={order.refunds} />
            </Panel>
          )}
          {can(admin, "audit.view") && (
            <Panel title="Audit history" description="Admin changes to this order. Open an entry to see what changed.">
              <AuditTrail entries={order.audit} />
            </Panel>
          )}
        </div>

        <div className={styles.side}>
          <Panel title="Customer">
            <Facts
              items={[
                [
                  "Name",
                  can(admin, "customers.view") ? (
                    <Link href={`/admin/customers/${order.customer.id}`}>{order.customer.fullName ?? "Unnamed customer"}</Link>
                  ) : (
                    (order.customer.fullName ?? "Unnamed customer")
                  ),
                ],
                ["Phone", <a href={`tel:${order.customer.phone}`}>{formatPhone(order.customer.phone)}</a>],
                ["Email", order.customer.email],
                ["Orders", String(order.customer.orderCount)],
              ]}
            />
            {order.riskFlags.length > 0 && (
              <div className={styles.flags} aria-label="Risk flags">
                {order.riskFlags.map((f) => (
                  <Badge key={f} tone="warning">
                    {riskLabel(f)}
                  </Badge>
                ))}
              </div>
            )}
          </Panel>
          <Panel title="Ship to">
            <address className={styles.address}>
              <strong>{a.fullName}</strong>
              <br />
              {a.line1}
              {a.line2 && (
                <>
                  <br />
                  {a.line2}
                </>
              )}
              <br />
              {a.area}, {a.city}
              <br />
              {a.state} {a.pincode}
              {a.landmark && (
                <>
                  <br />
                  Landmark: {a.landmark}
                </>
              )}
              <br />
              <a href={`tel:${a.phone}`}>{formatPhone(a.phone)}</a>
            </address>
          </Panel>
          <Panel title="Status history">
            <OrderTimeline history={order.history} />
          </Panel>
          <Panel title="Key dates">
            <Facts
              items={[
                ["Cancel window ends", formatDateTime(order.cancelDeadlineAt)],
                ["Delivered", order.deliveredAt ? formatDateTime(order.deliveredAt) : null],
                ["Return window ends", order.returnDeadlineAt ? formatDate(order.returnDeadlineAt) : null],
                ["Payment expires", order.paymentExpiresAt ? formatDateTime(order.paymentExpiresAt) : null],
              ]}
            />
          </Panel>
          <Panel title="Internal notes" description="Only admins can see these.">
            <NotesPanel orderId={order.id} notes={order.notes} />
          </Panel>
        </div>
      </div>
    </>
  );
}
