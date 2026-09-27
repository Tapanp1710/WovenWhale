import { Skeleton } from "./Skeleton";
import styles from "./ListSkeleton.module.css";

/** Stacked row placeholders for list pages (orders, addresses, returns). */
export function ListSkeleton({ rows = 4, rowHeight = "72px", label }: { rows?: number; rowHeight?: string; label: string }) {
  return (
    <div className={styles.list} aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={rowHeight} />
      ))}
    </div>
  );
}
