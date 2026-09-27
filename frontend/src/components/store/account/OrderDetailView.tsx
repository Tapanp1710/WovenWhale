import { PAYMENT_STATUS_LABELS, type OrderDetailDTO } from "@wovenwhale/backend/contracts";
import Image from "next/image";
import Link from "next/link";
import { formatAddress, formatDateTime, formatINR, formatPhone } from "@/lib/format";
import { OrderActions } from "./OrderActions";
import { OrderTimeline } from "./OrderTimeline";
import { ReturnList } from "./ReturnList";
import { ReturnRequest } from "./ReturnRequest";
import { OrderStatusBadge, PaymentStatusBadge } from "./StatusBadge";
import styles from "./OrderDetailView.module.css";

const STATUS_NOTE: Partial<Record<OrderDetailDTO["status"], string>> = {
  PENDING_COD_APPROVAL: "Our team confirms cash on delivery orders before they ship. You'll see the update here.",
  REJECTED: "We couldn't accept cash on delivery for this order, so it won't be shipped. You haven't been charged.",
};

export function OrderDetailView({ order }: { order: OrderDetailDTO }) {
  const note = STATUS_NOTE[order.status];
  return (
    <article className={styles.order}>
      <header className={styles.header}>
        <div>
          <Link href="/account/orders" className={styles.back}>
            All orders
          </Link>
          <h2 className={styles.title}>Order {order.orderNumber}</h2>
          <p className={styles.muted}>Placed {formatDateTime(order.placedAt)}</p>
        </div>
        <div className={styles.badges}>
          <OrderStatusBadge status={order.status} />
          <PaymentStatusBadge status={order.paymentStatus} />
        </div>
      </header>

      {note && <p className={styles.note}>{note}</p>}
      {order.cancelReason && order.status === "CANCELLED" && <p className={styles.note}>Cancelled: {order.cancelReason}</p>}

      <OrderActions order={order} />

      <div className={styles.grid}>
        <section className={styles.panel} aria-labelledby="progress">
          <h3 id="progress" className={styles.heading}>
            Progress
          </h3>
          <OrderTimeline order={order} />
          {order.shipments.map((s) => (
            <div key={s.id} className={styles.shipment}>
              <p>
                <strong>{s.courierName}</strong> AWB {s.awb}
              </p>
              {s.trackingUrl && (
                <a href={s.trackingUrl} target="_blank" rel="noopener noreferrer" className={styles.link}>
                  Track with {s.courierName}
                </a>
              )}
              <ul className={styles.events}>
                {s.events
                  .slice()
                  .reverse()
                  .map((e, i) => (
                    <li key={i}>
                      <span>{e.description || e.status.replace(/_/g, " ").toLowerCase()}</span>
                      <time dateTime={e.occurredAt}>{formatDateTime(e.occurredAt)}</time>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </section>

        <section className={styles.panel} aria-labelledby="delivery">
          <h3 id="delivery" className={styles.heading}>
            Delivery address
          </h3>
          <p className={styles.address}>
            <strong>{order.shippingAddress.fullName}</strong>
            <br />
            {formatAddress(order.shippingAddress)}
            <br />
            {formatPhone(order.shippingAddress.phone)}
          </p>
        </section>
      </div>

      <section className={styles.panel} aria-labelledby="items">
        <h3 id="items" className={styles.heading}>
          Items
        </h3>
        <ul className={styles.items}>
          {order.items.map((i) => (
            <li key={i.id} className={styles.item}>
              <span className={styles.thumb}>{i.imageUrl && <Image src={i.imageUrl} alt="" fill sizes="64px" />}</span>
              <span className={styles.itemInfo}>
                {i.productSlug ? <Link href={`/product/${i.productSlug}`}>{i.productName}</Link> : i.productName}
                <span className={styles.muted}>
                  Size {i.size}, qty {i.quantity}, {formatINR(i.unitPricePaise)} each
                </span>
              </span>
              <span className={styles.amount}>{formatINR(i.lineTotalPaise)}</span>
            </li>
          ))}
        </ul>
        <dl className={styles.totals}>
          <div>
            <dt>Subtotal</dt>
            <dd>{formatINR(order.subtotalPaise)}</dd>
          </div>
          {order.discountPaise > 0 && (
            <div>
              <dt>Coupon {order.couponCodes.join(", ")}</dt>
              <dd>−{formatINR(order.discountPaise)}</dd>
            </div>
          )}
          <div>
            <dt>Delivery</dt>
            <dd>{order.shippingPaise ? formatINR(order.shippingPaise) : "Free"}</dd>
          </div>
          {order.codFeePaise > 0 && (
            <div>
              <dt>Cash on delivery fee</dt>
              <dd>{formatINR(order.codFeePaise)}</dd>
            </div>
          )}
          <div className={styles.total}>
            <dt>Total</dt>
            <dd>{formatINR(order.totalPaise)}</dd>
          </div>
          <div>
            <dt>Payment</dt>
            <dd>
              {order.paymentMethod === "COD" ? "Cash on delivery" : "Online"}, {PAYMENT_STATUS_LABELS[order.paymentStatus].toLowerCase()}
            </dd>
          </div>
        </dl>
      </section>

      {(order.status === "DELIVERED" || order.returns.length > 0) && (
        <section className={styles.panel} aria-labelledby="returns">
          <h3 id="returns" className={styles.heading}>
            Returns and exchanges
          </h3>
          <ReturnRequest order={order} />
          {order.returns.length > 0 && <ReturnList returns={order.returns} />}
        </section>
      )}

      {order.refunds.length > 0 && (
        <section className={styles.panel} aria-labelledby="refunds">
          <h3 id="refunds" className={styles.heading}>
            Refunds
          </h3>
          <ul className={styles.refunds}>
            {order.refunds.map((r) => (
              <li key={r.id}>
                <span>
                  {formatINR(r.amountPaise)} to{" "}
                  {r.method === "ORIGINAL_PAYMENT" ? "your original payment method" : r.method === "UPI" ? "UPI" : "your bank account"}
                </span>
                <span className={styles.muted}>
                  {r.status === "PROCESSED" && r.processedAt ? `Refunded ${formatDateTime(r.processedAt)}` : "In progress"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className={styles.help}>
        Need help with this order? <Link href={`/support?order=${order.orderNumber}`}>Contact support</Link>
      </p>
    </article>
  );
}
