import type { StatusHistoryDTO } from "@wovenwhale/backend/contracts";
import { formatDateTime } from "@/lib/format";
import { humanize, ORDER_STATUS_ADMIN_LABELS } from "../labels";
import styles from "./OrderTimeline.module.css";

/** Status changes, newest first, with who made them. */
export function OrderTimeline({ history }: { history: StatusHistoryDTO[] }) {
  const sorted = [...history].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <ol className={styles.timeline}>
      {sorted.map((h, i) => (
        <li key={`${h.toStatus}-${h.createdAt}`} className={i === 0 ? `${styles.step} ${styles.current}` : styles.step}>
          <p className={styles.status}>{ORDER_STATUS_ADMIN_LABELS[h.toStatus]}</p>
          <p className={styles.meta}>
            {formatDateTime(h.createdAt)} · {humanize(h.actorType)}
          </p>
          {h.note && <p className={styles.note}>{h.note}</p>}
        </li>
      ))}
    </ol>
  );
}
