import { Skeleton } from "@/components/ui/Skeleton";
import styles from "./CatalogSkeleton.module.css";

/** Mirrors the catalog layout so content doesn't jump when results arrive. */
export function CatalogSkeleton() {
  return (
    <div className={styles.page} aria-busy="true" aria-label="Loading products">
      <Skeleton width="180px" height="14px" />
      <Skeleton width="min(420px, 70%)" height="48px" className={styles.title} />
      <div className={styles.layout}>
        <div className={styles.sidebar}>
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} height="88px" />
          ))}
        </div>
        <ul className={styles.grid}>
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i}>
              <Skeleton height="auto" radius="0" className={styles.image} />
              <Skeleton width="80%" height="16px" />
              <Skeleton width="40%" height="14px" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
