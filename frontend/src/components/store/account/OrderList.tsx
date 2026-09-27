import type { OrderSummaryDTO } from "@wovenwhale/backend/contracts";
import Image from "next/image";
import Link from "next/link";
import { formatDate, formatINR } from "@/lib/format";
import { OrderStatusBadge } from "./StatusBadge";
import styles from "./OrderList.module.css";

export function OrderList({ orders }: { orders: OrderSummaryDTO[] }) {
  return (
    <ul className={styles.list}>
      {orders.map((o) => (
        <li key={o.id}>
          <Link href={`/account/orders/${o.orderNumber}`} className={styles.row}>
            <span className={styles.images} aria-hidden="true">
              {o.previewImages.slice(0, 3).map((src) => (
                <span key={src} className={styles.thumb}>
                  <Image src={src} alt="" fill sizes="56px" />
                </span>
              ))}
            </span>
            <span className={styles.meta}>
              <span className={styles.number}>Order {o.orderNumber}</span>
              <span className={styles.sub}>
                {formatDate(o.placedAt)}, {o.itemCount} {o.itemCount === 1 ? "item" : "items"},{" "}
                {o.paymentMethod === "COD" ? "cash on delivery" : "paid online"}
              </span>
            </span>
            <span className={styles.right}>
              <OrderStatusBadge status={o.status} />
              <span className={styles.total}>{formatINR(o.totalPaise)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
