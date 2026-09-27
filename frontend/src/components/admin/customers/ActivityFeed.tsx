import type { AdminCustomerDetailDTO } from "@wovenwhale/backend/contracts";
import { formatDateTime } from "@/lib/format";
import { humanize } from "../labels";
import styles from "./ActivityFeed.module.css";

type Event = AdminCustomerDetailDTO["events"][number];

/** Short, human description of an event's metadata (search terms, product, amount). */
function detail(e: Event) {
  const m = e.metadata ?? {};
  const bits = [m.query, m.name, m.productName, m.method].filter((v): v is string => typeof v === "string");
  return [...bits, e.path].filter(Boolean).join(" · ");
}

export function ActivityFeed({ events }: { events: AdminCustomerDetailDTO["events"] }) {
  if (!events.length) return <p className={styles.none}>No recent activity.</p>;
  return (
    <ol className={styles.feed}>
      {events.map((e, i) => (
        <li key={`${e.createdAt}-${i}`} className={styles.item}>
          <span className={styles.type}>{humanize(e.type)}</span>
          <span className={styles.meta}>
            {formatDateTime(e.createdAt)}
            {detail(e) && ` · ${detail(e)}`}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function WhatsAppLog({ messages }: { messages: AdminCustomerDetailDTO["whatsappMessages"] }) {
  if (!messages.length) return <p className={styles.none}>No WhatsApp messages.</p>;
  return (
    <ol className={styles.chat}>
      {messages.map((m, i) => (
        <li key={`${m.createdAt}-${i}`} className={m.direction === "INBOUND" ? styles.inbound : styles.outbound}>
          <p>{m.body ?? (m.templateTopic ? `Template: ${humanize(m.templateTopic)}` : "No text")}</p>
          <p className={styles.meta}>
            {formatDateTime(m.createdAt)} · {humanize(m.status)}
          </p>
        </li>
      ))}
    </ol>
  );
}
