import type { ReactNode } from "react";
import styles from "./StatusPage.module.css";

/** Full-page state for 404s and errors: say what happened and offer the way forward. */
export function StatusPage({ code, title, children, actions }: { code?: string; title: string; children: ReactNode; actions: ReactNode }) {
  return (
    <div className={styles.page}>
      {code && (
        <p className={styles.code} aria-hidden="true">
          {code}
        </p>
      )}
      <h1 className={styles.title}>{title}</h1>
      <div className={styles.body}>{children}</div>
      <div className={styles.actions}>{actions}</div>
    </div>
  );
}
