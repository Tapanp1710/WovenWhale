import { ORDER_PROGRESS, ORDER_STATUS_LABELS, type OrderDetailDTO } from "@wovenwhale/backend/contracts";
import { formatDateTime } from "@/lib/format";
import styles from "./OrderTimeline.module.css";

/** Fulfilment progress for active orders; a plain history for cancelled/rejected ones. */
export function OrderTimeline({ order }: { order: OrderDetailDTO }) {
  const reached = new Map(order.history.map((h) => [h.toStatus, h.createdAt]));
  const stopped = order.status === "CANCELLED" || order.status === "REJECTED";

  if (stopped || order.status === "PENDING_PAYMENT" || order.status === "PENDING_COD_APPROVAL") {
    return (
      <ol className={styles.history}>
        {order.history.map((h, i) => (
          <li key={i}>
            <span className={styles.label}>{ORDER_STATUS_LABELS[h.toStatus]}</span>
            <time className={styles.time} dateTime={h.createdAt}>
              {formatDateTime(h.createdAt)}
            </time>
            {h.note && h.actorType !== "SYSTEM" && <span className={styles.note}>{h.note}</span>}
          </li>
        ))}
      </ol>
    );
  }

  const currentIndex = ORDER_PROGRESS.indexOf(order.status);
  return (
    <ol className={styles.progress} aria-label="Order progress">
      {ORDER_PROGRESS.map((status, i) => {
        const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "todo";
        const at = reached.get(status);
        return (
          <li key={status} className={styles[state]} aria-current={state === "current" ? "step" : undefined}>
            <span className={styles.dot} aria-hidden="true" />
            <span className={styles.label}>{ORDER_STATUS_LABELS[status]}</span>
            {at && (
              <time className={styles.time} dateTime={at}>
                {formatDateTime(at)}
              </time>
            )}
          </li>
        );
      })}
    </ol>
  );
}
