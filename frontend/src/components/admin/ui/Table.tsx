import type { CSSProperties, ReactNode } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import styles from "./Table.module.css";

/** Cell helpers for tables rendered inside <Table>. */
export const cell = {
  num: styles.num,
  muted: styles.muted,
  strong: styles.strong,
  nowrap: styles.nowrap,
  actions: styles.actions,
  link: styles.link,
  thumb: styles.thumb,
  sub: styles.sub,
  media: styles.media,
};

/**
 * Data table with a labelled, keyboard-scrollable region so wide tables stay
 * usable on phones. Children are the <thead>/<tbody> of the table.
 */
export function Table({ label, children, minWidth = 720 }: { label: string; children: ReactNode; minWidth?: number }) {
  return (
    <div className={styles.scroll} role="region" aria-label={label} tabIndex={0}>
      <table className={styles.table} style={{ "--min": `${minWidth}px` } as CSSProperties}>
        <caption className="visually-hidden">{label}</caption>
        {children}
      </table>
    </div>
  );
}

export function TableSkeleton({ rows = 8, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className={styles.skeleton} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className={styles.skeletonRow} style={{ "--cols": columns } as CSSProperties}>
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} height="0.9em" width={c === 0 ? "80%" : "60%"} />
          ))}
        </div>
      ))}
    </div>
  );
}
