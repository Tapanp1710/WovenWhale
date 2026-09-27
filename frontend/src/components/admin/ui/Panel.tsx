import type { ReactNode } from "react";
import styles from "./Panel.module.css";

/**
 * A titled section. `flush` removes body padding for tables; `tone="attention"`
 * is reserved for queues that need action now (COD approvals).
 */
export function Panel({
  title,
  description,
  actions,
  flush,
  tone,
  id,
  className,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  flush?: boolean;
  tone?: "attention";
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={title ? headingId : undefined}
      className={[styles.panel, tone && styles[tone], className].filter(Boolean).join(" ")}
    >
      {(title || actions) && (
        <div className={styles.head}>
          <div>
            {title && (
              <h2 id={headingId} className={styles.title}>
                {title}
              </h2>
            )}
            {description && <p className={styles.description}>{description}</p>}
          </div>
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
      <div className={flush ? undefined : styles.body}>{children}</div>
    </section>
  );
}
