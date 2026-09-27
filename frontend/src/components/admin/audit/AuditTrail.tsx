import type { AuditLogDTO } from "@wovenwhale/backend/contracts";
import { formatDateTime } from "@/lib/format";
import { humanize } from "../labels";
import { AuditDiff } from "./AuditDiff";
import styles from "./AuditTrail.module.css";

/** Compact audit history with a native disclosure for each entry's before/after. */
export function AuditTrail({ entries }: { entries: AuditLogDTO[] }) {
  if (!entries.length) return <p className={styles.none}>No admin changes recorded yet.</p>;
  return (
    <ol className={styles.list}>
      {entries.map((e) => (
        <li key={e.id}>
          <details className={styles.entry}>
            <summary className={styles.summary}>
              <span className={styles.action}>{humanize(e.action)}</span>
              <span className={styles.meta}>
                {e.actorEmail ?? "System"} · {formatDateTime(e.createdAt)}
              </span>
            </summary>
            <div className={styles.body}>
              <AuditDiff before={e.before} after={e.after} />
            </div>
          </details>
        </li>
      ))}
    </ol>
  );
}
