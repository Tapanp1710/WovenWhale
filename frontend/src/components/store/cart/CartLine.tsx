"use client";

import type { CartLineDTO } from "@wovenwhale/backend/contracts";
import { motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { formatINR } from "@/lib/format";
import { useCart } from "../providers/CartProvider";
import styles from "./CartLine.module.css";

const ISSUE_COPY: Record<NonNullable<CartLineDTO["issue"]>, (l: CartLineDTO) => string> = {
  OUT_OF_STOCK: () => "Sold out in this size. Remove it to continue.",
  INSUFFICIENT_STOCK: (l) => `Only ${l.available} left. Reduce the quantity to continue.`,
  UNAVAILABLE: () => "No longer available. Remove it to continue.",
};

export function CartLine({ line, compact = false, onNavigate }: { line: CartLineDTO; compact?: boolean; onNavigate?: () => void }) {
  const { updateQuantity, removeItem, busy } = useCart();
  const reduce = useReducedMotion();
  // Sold-out/unavailable lines are excluded from server totals.
  const priced = line.issue !== "OUT_OF_STOCK" && line.issue !== "UNAVAILABLE";
  const max = Math.max(1, Math.min(10, line.issue === "INSUFFICIENT_STOCK" ? line.quantity : line.available));

  return (
    <motion.li
      layout={!reduce}
      className={`${styles.line} ${compact ? styles.compact : ""}`}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, x: 24, transition: { duration: 0.2 } }}
      transition={{ duration: 0.25 }}
    >
      <Link href={`/product/${line.slug}`} className={styles.media} onClick={onNavigate} tabIndex={-1} aria-hidden="true">
        {line.imageUrl && <Image src={line.imageUrl} alt="" fill sizes="120px" className={styles.img} />}
      </Link>
      <div className={styles.info}>
        <div className={styles.top}>
          <Link href={`/product/${line.slug}`} className={styles.name} onClick={onNavigate}>
            {line.name}
          </Link>
          <p className={styles.amount}>
            {line.discountPaise > 0 && <s className={styles.was}>{formatINR(line.lineSubtotalPaise)}</s>}
            {formatINR(priced ? line.lineTotalPaise : line.unitPricePaise * line.quantity)}
          </p>
        </div>
        <p className={styles.meta}>
          Size {line.size}
          {line.unitMrpPaise > line.unitPricePaise && (
            <>
              <span aria-hidden="true"> / </span>
              <s>{formatINR(line.unitMrpPaise)}</s> {formatINR(line.unitPricePaise)} each
            </>
          )}
        </p>
        {line.issue && (
          <p className={styles.issue} role="alert">
            {ISSUE_COPY[line.issue](line)}
          </p>
        )}
        <div className={styles.actions}>
          {line.issue !== "OUT_OF_STOCK" && line.issue !== "UNAVAILABLE" && (
            <QuantityStepper
              size="sm"
              value={line.quantity}
              max={max}
              disabled={busy}
              label={`Quantity for ${line.name}`}
              onChange={(q) => void updateQuantity(line.id, q)}
            />
          )}
          <button type="button" className={styles.remove} onClick={() => void removeItem(line.id)} disabled={busy}>
            Remove
          </button>
        </div>
      </div>
    </motion.li>
  );
}
