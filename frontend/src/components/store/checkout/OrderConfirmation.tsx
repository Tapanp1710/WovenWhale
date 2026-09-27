"use client";

import type { OrderDetailDTO } from "@wovenwhale/backend/contracts";
import { motion, useReducedMotion } from "framer-motion";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { formatDateTime, formatINR } from "@/lib/format";
import styles from "./OrderConfirmation.module.css";

const COPY: Partial<Record<OrderDetailDTO["status"], { title: string; body: string }>> = {
  CONFIRMED: { title: "Thank you. Your order is confirmed.", body: "We've received your payment and will start preparing your order." },
  PENDING_COD_APPROVAL: {
    title: "Thank you. We've received your order.",
    body: "Cash on delivery orders are confirmed by our team before they ship. We'll update your order page as soon as it's approved.",
  },
  PENDING_PAYMENT: {
    title: "Your order is waiting for payment",
    body: "We haven't received your payment yet. You can complete it from your order page before the hold expires.",
  },
};

/** The one celebratory moment after purchase: a check that draws itself in. */
export function OrderConfirmation({ order }: { order: OrderDetailDTO }) {
  const reduce = useReducedMotion();
  const copy = COPY[order.status] ?? { title: "Thank you for your order", body: "You can follow its progress from your account." };
  const pending = order.status === "PENDING_PAYMENT";

  return (
    <div className={styles.page}>
      <svg className={`${styles.mark} ${pending ? styles.pending : ""}`} viewBox="0 0 64 64" aria-hidden="true">
        <motion.circle
          cx="32"
          cy="32"
          r="29"
          fill="none"
          strokeWidth="3"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.6 }}
        />
        {!pending && (
          <motion.path
            d="M20 33 l8 8 l16 -18"
            fill="none"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.4, delay: 0.55 }}
          />
        )}
      </svg>
      <motion.div
        className={styles.copy}
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: reduce ? 0 : 0.7 }}
      >
        <h1 className={styles.title}>{copy.title}</h1>
        <p className={styles.body}>{copy.body}</p>
        <dl className={styles.facts}>
          <div>
            <dt>Order number</dt>
            <dd>{order.orderNumber}</dd>
          </div>
          <div>
            <dt>Placed</dt>
            <dd>{formatDateTime(order.placedAt)}</dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd>{formatINR(order.totalPaise)}</dd>
          </div>
          <div>
            <dt>Payment</dt>
            <dd>{order.paymentMethod === "COD" ? "Cash on delivery" : "Paid online"}</dd>
          </div>
        </dl>
        <p className={styles.body}>
          Delivering to {order.shippingAddress.fullName}, {order.shippingAddress.city} {order.shippingAddress.pincode}.
        </p>
        <div className={styles.actions}>
          <ButtonLink href={`/account/orders/${order.orderNumber}`}>View order</ButtonLink>
          <ButtonLink href="/shop" variant="secondary">
            Continue shopping
          </ButtonLink>
        </div>
      </motion.div>
    </div>
  );
}
