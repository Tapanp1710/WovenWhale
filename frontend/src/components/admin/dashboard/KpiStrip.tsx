import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import styles from "./KpiStrip.module.css";

export interface Kpi {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  href?: string;
  /** Haldi highlight: this number means someone needs to act. */
  attention?: boolean;
}

/** Key numbers as one ruled strip rather than a wall of separate cards. */
export function KpiStrip({ items, label, columns = 5 }: { items: Kpi[]; label: string; columns?: number }) {
  return (
    <div className={styles.strip}>
      <ul className={styles.grid} aria-label={label} style={{ "--kpi-lg": columns } as CSSProperties}>
        {items.map((k) => {
          const body = (
            <>
              <span className={styles.label}>{k.label}</span>
              <span className={styles.value}>{k.value}</span>
              {k.sub && <span className={styles.sub}>{k.sub}</span>}
            </>
          );
          return (
            <li key={k.label} className={k.attention ? `${styles.tile} ${styles.attention}` : styles.tile}>
              {k.href ? (
                <Link href={k.href} className={styles.inner}>
                  {body}
                </Link>
              ) : (
                <div className={styles.inner}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
