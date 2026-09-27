import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";

/** An empty screen is an invitation to act: say what's missing and offer the next step. */
export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      {icon && <div className={styles.icon}>{icon}</div>}
      <h2 className={styles.title}>{title}</h2>
      {children && <div className={styles.body}>{children}</div>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
