import { formatINR } from "@/lib/format";
import styles from "./Price.module.css";

/** Selling price with MRP and discount. MRP is only shown when there is a real saving. */
export function Price({ pricePaise, mrpPaise, size = "md" }: { pricePaise: number; mrpPaise: number; size?: "sm" | "md" | "lg" }) {
  const off = mrpPaise > pricePaise ? Math.floor(((mrpPaise - pricePaise) * 100) / mrpPaise) : 0;
  return (
    <p className={`${styles.price} ${styles[size]}`}>
      <span className={styles.selling} data-price={pricePaise}>
        {formatINR(pricePaise)}
      </span>
      {off > 0 && (
        <>
          <s className={styles.mrp}>
            <span className="visually-hidden">MRP </span>
            {formatINR(mrpPaise)}
          </s>
          <span className={styles.off}>{off}% off</span>
        </>
      )}
    </p>
  );
}
