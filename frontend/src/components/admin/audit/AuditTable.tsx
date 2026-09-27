import type { AuditLogDTO } from "@wovenwhale/backend/contracts";
import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import { humanize } from "../labels";
import { cell, Table } from "../ui/Table";
import { AuditDiff, diffRows } from "./AuditDiff";
import styles from "./AuditTable.module.css";

/** Where an audited entity lives in the admin, when it has a page. */
const ENTITY_HREF: Record<string, (id: string) => string> = {
  order: (id) => `/admin/orders/${id}`,
  product: (id) => `/admin/products/${id}`,
  coupon: (id) => `/admin/coupons/${id}`,
  customer: (id) => `/admin/customers/${id}`,
  return: (id) => `/admin/returns/${id}`,
};

export const AUDIT_ENTITY_TYPES = [
  "order",
  "product",
  "variant",
  "category",
  "coupon",
  "customer",
  "return",
  "refund",
  "checkout",
  "settings",
  "admin_user",
  "role",
  "whatsapp_template",
] as const;

export function AuditTable({ rows }: { rows: AuditLogDTO[] }) {
  return (
    <Table label="Audit log" minWidth={900}>
      <thead>
        <tr>
          <th scope="col">When</th>
          <th scope="col">Who</th>
          <th scope="col">Action</th>
          <th scope="col">Record</th>
          <th scope="col">Changes</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((e) => {
          const href = ENTITY_HREF[e.entityType]?.(e.entityId);
          const changes = diffRows(e.before, e.after).length;
          return (
            <tr key={e.id} className={styles.row}>
              <td className={cell.nowrap}>{formatDateTime(e.createdAt)}</td>
              <td className={cell.muted}>{e.actorEmail ?? "System"}</td>
              <td className={cell.strong}>{humanize(e.action)}</td>
              <td>
                {humanize(e.entityType)}
                <span className={cell.sub}>
                  {href ? (
                    <Link href={href} className={cell.link}>
                      {e.entityId.slice(0, 8)}
                    </Link>
                  ) : (
                    e.entityId.slice(0, 8)
                  )}{" "}
                  <Link href={`/admin/audit-logs?entityType=${e.entityType}&entityId=${e.entityId}`} className={styles.history}>
                    history
                  </Link>
                </span>
              </td>
              <td className={styles.changes}>
                {changes ? (
                  <details>
                    <summary className={styles.summary}>
                      {changes} {changes === 1 ? "field" : "fields"}
                    </summary>
                    <div className={styles.diff}>
                      <AuditDiff before={e.before} after={e.after} />
                    </div>
                  </details>
                ) : (
                  <span className={cell.muted}>No field changes</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
