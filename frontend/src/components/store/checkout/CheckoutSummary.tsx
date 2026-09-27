"use client";

import type { QuoteDTO } from "@wovenwhale/backend/contracts";
import Image from "next/image";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatINR } from "@/lib/format";
import { CartSummary } from "../cart/CartSummary";
import styles from "./CheckoutSummary.module.css";

export function CheckoutSummary({ quote }: { quote: QuoteDTO | null }) {
  if (!quote) {
    return (
      <div className={styles.summary} aria-busy="true">
        <Skeleton height="72px" />
        <Skeleton height="72px" />
        <Skeleton height="160px" />
      </div>
    );
  }
  return (
    <div className={styles.summary}>
      <h2 className={styles.title}>Order summary</h2>
      <ul className={styles.lines}>
        {quote.lines.map((l) => (
          <li key={l.id} className={styles.line}>
            <span className={styles.thumb}>
              {l.imageUrl && <Image src={l.imageUrl} alt="" fill sizes="56px" />}
              <span className={styles.qty} aria-label={`Quantity ${l.quantity}`}>
                {l.quantity}
              </span>
            </span>
            <span className={styles.name}>
              {l.name}
              <span className={styles.size}>Size {l.size}</span>
              {l.issue && (
                <span className={styles.issue}>{l.issue === "INSUFFICIENT_STOCK" ? `Only ${l.available} left` : "Unavailable"}</span>
              )}
            </span>
            <span className={styles.amount}>
              {formatINR(l.issue === "OUT_OF_STOCK" || l.issue === "UNAVAILABLE" ? l.unitPricePaise * l.quantity : l.lineTotalPaise)}
            </span>
          </li>
        ))}
      </ul>
      <CartSummary cart={quote} />
    </div>
  );
}
