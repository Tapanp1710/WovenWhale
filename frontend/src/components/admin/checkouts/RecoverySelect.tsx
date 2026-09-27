"use client";

import { RECOVERY_STATUSES, type RecoveryStatus } from "@wovenwhale/backend/contracts";
import { useState } from "react";
import { api } from "@/lib/api/client";
import { useAction, useCan } from "../AdminContext";
import { humanize } from "../labels";
import styles from "./RecoverySelect.module.css";

/** Inline recovery-status tracker; saves on change and reverts if the API refuses. */
export function RecoverySelect({ id, value, label }: { id: string; value: RecoveryStatus; label: string }) {
  const canEdit = useCan("orders.manage", "customers.manage");
  const { run, pending } = useAction();
  const [current, setCurrent] = useState(value);
  if (!canEdit) return <span>{humanize(value)}</span>;

  async function change(next: RecoveryStatus) {
    const prev = current;
    setCurrent(next);
    const ok = await run(() => api(`/admin/checkouts/${id}`, { method: "PATCH", body: { recoveryStatus: next } }), "Recovery status saved");
    if (!ok) setCurrent(prev);
  }

  return (
    <select
      className={styles.select}
      value={current}
      disabled={pending}
      aria-label={label}
      onChange={(e) => change(e.target.value as RecoveryStatus)}
    >
      {RECOVERY_STATUSES.map((s) => (
        <option key={s} value={s}>
          {humanize(s)}
        </option>
      ))}
    </select>
  );
}
