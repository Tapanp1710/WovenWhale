import type { ShipmentDTO } from "@wovenwhale/backend/contracts";
import { ExternalLink } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { humanize } from "../labels";
import { Badge } from "../ui/Badge";
import styles from "./ShipmentsList.module.css";

export function ShipmentsList({ shipments }: { shipments: ShipmentDTO[] }) {
  if (!shipments.length) return <p className={styles.none}>Not shipped yet.</p>;
  return (
    <ul className={styles.list}>
      {shipments.map((s) => (
        <li key={s.id} className={styles.shipment}>
          <div className={styles.head}>
            <p>
              <span className={styles.courier}>{s.courierName ?? "Courier"}</span> · AWB{" "}
              <span className={styles.awb}>{s.awb ?? "pending"}</span>
            </p>
            <Badge tone={s.status === "DELIVERED" ? "success" : s.status === "FAILED_DELIVERY" || s.status === "RTO" ? "danger" : "info"}>
              {humanize(s.status)}
            </Badge>
          </div>
          {s.trackingUrl && (
            <a href={s.trackingUrl} target="_blank" rel="noreferrer noopener" className={styles.track}>
              Open tracking <ExternalLink size={13} aria-hidden="true" />
            </a>
          )}
          {s.events.length > 0 && (
            <ul className={styles.events}>
              {s.events.map((e, i) => (
                <li key={i}>
                  <span>{e.description ?? humanize(e.status)}</span>
                  <span className={styles.meta}>{[e.location, formatDateTime(e.occurredAt)].filter(Boolean).join(" · ")}</span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
