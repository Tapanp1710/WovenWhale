"use client";

import type { AdminOrderRowDTO } from "@wovenwhale/backend/contracts";
import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { formatDateTime, formatINR, formatPhone } from "@/lib/format";
import { riskLabel } from "../labels";
import { CodActions } from "../orders/CodActions";
import { Badge } from "../ui/Badge";
import styles from "./CodQueue.module.css";

/** COD orders waiting for a call-and-confirm decision, oldest first. */
export function CodQueue({ rows }: { rows: AdminOrderRowDTO[] }) {
  if (!rows.length) {
    return (
      <p className={styles.clear}>
        <CircleCheck size={18} aria-hidden="true" /> No COD orders are waiting for approval.
      </p>
    );
  }

  return (
    <ul className={styles.list}>
      {rows.map((row) => {
        const a = row.shippingAddress;
        return (
          <li key={row.id} className={styles.row}>
            <div className={styles.order}>
              <Link href={`/admin/orders/${row.id}`} className={styles.number}>
                {row.orderNumber}
              </Link>
              <span className={styles.muted}>{formatDateTime(row.placedAt)}</span>
            </div>
            <div className={styles.customer}>
              <span className={styles.name}>{row.customerName ?? "Guest"}</span>
              <a href={`tel:${row.customerPhone}`} className={styles.phone}>
                {formatPhone(row.customerPhone)}
              </a>
            </div>
            <ul className={styles.items} aria-label="Items">
              {row.items.map((item, i) => (
                <li key={i}>
                  {item.productName}{" "}
                  <span className={styles.muted}>
                    ({item.size}) × {item.quantity}
                  </span>
                </li>
              ))}
            </ul>
            <div className={styles.place}>
              <span>
                {a?.city ?? row.city} {row.pincode}
              </span>
              {a && <span className={styles.muted}>{[a.area, a.state].filter(Boolean).join(", ")}</span>}
            </div>
            <div className={styles.flags}>
              {row.riskFlags.length ? (
                row.riskFlags.map((f) => (
                  <Badge key={f} tone="warning">
                    {riskLabel(f)}
                  </Badge>
                ))
              ) : (
                <span className={styles.muted}>No risk flags</span>
              )}
            </div>
            <div className={styles.amount}>{formatINR(row.totalPaise)}</div>
            <div className={styles.actions}>
              <CodActions order={row} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
