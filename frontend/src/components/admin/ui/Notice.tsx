import { Info } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./Notice.module.css";

/** Inline explanation banner (informational, not an alert). */
export function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.notice}>
      <Info size={18} aria-hidden="true" className={styles.icon} />
      <div>
        <p className={styles.title}>{title}</p>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
