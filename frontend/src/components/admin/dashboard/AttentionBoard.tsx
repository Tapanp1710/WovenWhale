import type { AdminSessionDTO, DashboardDTO } from "@wovenwhale/backend/contracts";
import { CircleCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatDateTime, formatINR, formatPhone } from "@/lib/format";
import { can, count, humanize, riskLabel } from "../labels";
import { CodActions } from "../orders/CodActions";
import { ReturnActions } from "../returns/ReturnActions";
import { Badge } from "../ui/Badge";
import styles from "./AttentionBoard.module.css";

/**
 * Everything waiting on a person, side by side: one column per kind of task,
 * oldest first, each card with the action that clears it. A column appears
 * only when the admin's role can act on it.
 */
export function AttentionBoard({ data, admin }: { data: DashboardDTO; admin: AdminSessionDTO }) {
  const a = data.attention;
  const columns = [
    can(admin, "orders.view") && (
      <Column key="cod" title="COD approvals" total={data.kpis.codPendingApproval} href="/admin/cod" empty="No cash on delivery orders waiting.">
        {data.codPending.map((o) => (
          <li key={o.id} className={styles.card}>
            <div className={styles.cardHead}>
              <Link href={`/admin/orders/${o.id}`} className={styles.ref}>
                {o.orderNumber}
              </Link>
              <strong className={styles.amount}>{formatINR(o.totalPaise)}</strong>
            </div>
            <p className={styles.line}>
              {o.customerName ?? "Guest"} ·{" "}
              <a href={`tel:${o.customerPhone}`} className={styles.phone}>
                {formatPhone(o.customerPhone)}
              </a>
            </p>
            <p className={styles.muted}>
              {o.items.reduce((n, i) => n + i.quantity, 0)} items · {o.city ?? o.shippingAddress?.city ?? ""} · {formatDateTime(o.placedAt)}
            </p>
            {o.riskFlags.length > 0 && (
              <div className={styles.flags}>
                {o.riskFlags.map((f) => (
                  <Badge key={f} tone="warning">
                    {riskLabel(f)}
                  </Badge>
                ))}
              </div>
            )}
            <CodActions order={o} />
          </li>
        ))}
      </Column>
    ),
    can(admin, "returns.view") && (
      <Column key="returns" title="Returns to decide" total={a.returnsToDecideTotal} href="/admin/returns?status=REQUESTED" empty="No return requests waiting.">
        {a.returnsToDecide.map((r) => (
          <li key={r.id} className={styles.card}>
            <div className={styles.cardHead}>
              <Link href={`/admin/returns/${r.id}`} className={styles.ref}>
                {r.returnNumber}
              </Link>
              <strong className={styles.amount}>{formatINR(r.refundablePaise)}</strong>
            </div>
            <p className={styles.line}>
              {r.customerName ?? "Customer"} · {humanize(r.reason)}
            </p>
            <p className={styles.muted}>
              {r.items.map((i) => `${i.productName} (${i.size}) × ${i.quantity}`).join(", ")}
            </p>
            <ReturnActions ret={r} inline />
          </li>
        ))}
      </Column>
    ),
    (can(admin, "returns.view") || can(admin, "refunds.approve")) && (
      <Column
        key="refunds"
        title="Refunds due"
        total={a.refundsDueTotal + a.failedRefundsTotal}
        href="/admin/refunds"
        empty="No refunds waiting."
      >
        {a.failedRefunds.map((f) => (
          <li key={f.id} className={`${styles.card} ${styles.urgent}`}>
            <div className={styles.cardHead}>
              <Link href={`/admin/orders/${f.orderId}`} className={styles.ref}>
                {f.orderNumber}
              </Link>
              <strong className={styles.amount}>{formatINR(f.amountPaise)}</strong>
            </div>
            <Badge tone="danger">Refund failed</Badge>
            {f.failureReason && <p className={styles.muted}>{f.failureReason}</p>}
            <Link href={`/admin/orders/${f.orderId}`} className={styles.action}>
              Open the order to retry
            </Link>
          </li>
        ))}
        {a.refundsDue.map((r) => (
          <li key={r.id} className={styles.card}>
            <div className={styles.cardHead}>
              <Link href={`/admin/returns/${r.id}`} className={styles.ref}>
                {r.returnNumber}
              </Link>
              <strong className={styles.amount}>{formatINR(r.refundablePaise)}</strong>
            </div>
            <p className={styles.line}>{r.customerName ?? "Customer"} · item received</p>
            <p className={styles.muted}>
              {r.items.map((i) => `${i.productName} (${i.size}) × ${i.quantity}`).join(", ")}
            </p>
            <Link href={`/admin/returns/${r.id}`} className={styles.action}>
              {can(admin, "refunds.approve") ? "Approve the refund" : "Open the return"}
            </Link>
          </li>
        ))}
      </Column>
    ),
    (can(admin, "inventory.view") || can(admin, "products.view")) && (
      <Column key="stock" title="Low stock" total={data.kpis.lowStockVariants} href="/admin/inventory?lowStock=true" empty="Every size is above its reorder level.">
        {data.lowStock.map((v) => (
          <li key={v.variantId} className={styles.card}>
            <div className={styles.cardHead}>
              <Link href={`/admin/products/${v.productId}`} className={styles.ref}>
                {v.productName}
              </Link>
              <Badge tone={v.available <= 0 ? "danger" : "warning"}>{v.available <= 0 ? "Sold out" : `${v.available} left`}</Badge>
            </div>
            <p className={styles.muted}>
              Size {v.size} · {v.sku} · reorder at {v.lowStockThreshold}
            </p>
            {can(admin, "inventory.manage") && (
              <Link href={`/admin/products/${v.productId}`} className={styles.action}>
                Restock
              </Link>
            )}
          </li>
        ))}
      </Column>
    ),
  ].filter(Boolean);
  if (!columns.length) return null;

  return (
    <section className={styles.board} aria-labelledby="attention-title">
      <h2 id="attention-title" className={styles.title}>
        Needs your attention
      </h2>
      <div className={styles.columns}>{columns}</div>
    </section>
  );
}

function Column({ title, total, href, empty, children }: { title: string; total: number; href: string; empty: string; children: ReactNode[] }) {
  const id = `attention-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section className={`${styles.column} ${total > 0 ? styles.busy : ""}`} aria-labelledby={id}>
      <header className={styles.columnHead}>
        <h3 id={id} className={styles.columnTitle}>
          {title}
        </h3>
        <span className={styles.count} aria-label={`${total} waiting`}>
          {count(total)}
        </span>
      </header>
      {children.length ? (
        <ul className={styles.cards}>{children}</ul>
      ) : (
        <p className={styles.clear}>
          <CircleCheck size={16} aria-hidden="true" /> {empty}
        </p>
      )}
      <Link href={href} className={styles.all}>
        {total > children.length ? `See all ${count(total)}` : "Open"}
      </Link>
    </section>
  );
}
