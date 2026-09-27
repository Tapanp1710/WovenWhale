"use client";

import { PERMISSIONS, type Permission, type RoleDTO } from "@wovenwhale/backend/contracts";
import { Lock } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api/client";
import { useAction } from "../AdminContext";
import { humanize, PERMISSION_LABELS, ROLE_LABELS } from "../labels";
import { Panel } from "../ui/Panel";
import { cell, Table } from "../ui/Table";
import styles from "./RoleMatrix.module.css";

const AREAS = [...new Set(PERMISSIONS.map((p) => p.split(".")[0]!))];
const same = (a: Permission[], b: Permission[]) => a.length === b.length && a.every((p) => b.includes(p));

/** Role × permission grid. Super admin always has everything and can't be edited. */
export function RoleMatrix({ roles }: { roles: RoleDTO[] }) {
  const { run, pending } = useAction();
  const [draft, setDraft] = useState<Record<string, Permission[]>>(() => Object.fromEntries(roles.map((r) => [r.id, r.permissions])));
  const changed = roles.filter((r) => r.key !== "SUPER_ADMIN" && !same(r.permissions, draft[r.id] ?? []));

  const toggle = (roleId: string, p: Permission) =>
    setDraft((d) => {
      const cur = d[roleId] ?? [];
      return { ...d, [roleId]: cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p] };
    });

  async function save() {
    await run(
      () => Promise.all(changed.map((r) => api(`/admin/roles/${r.id}/permissions`, { method: "PUT", body: { permissions: draft[r.id] } }))),
      `Saved ${changed.length} ${changed.length === 1 ? "role" : "roles"}. Affected admins get the new access on their next request.`,
    );
  }

  return (
    <Panel
      flush
      title="Permissions by role"
      description="Changes apply to every admin with that role."
      actions={
        <Button size="sm" onClick={save} loading={pending} disabled={!changed.length}>
          {changed.length ? `Save ${changed.length} ${changed.length === 1 ? "role" : "roles"}` : "No changes"}
        </Button>
      }
    >
      <Table label="Permissions by role" minWidth={760}>
        <thead>
          <tr>
            <th scope="col">Permission</th>
            {roles.map((r) => (
              <th key={r.id} scope="col" className={styles.role}>
                {ROLE_LABELS[r.key]}
                {r.key === "SUPER_ADMIN" && <Lock size={12} aria-label="Locked" className={styles.lock} />}
              </th>
            ))}
          </tr>
        </thead>
        {AREAS.map((area) => (
          <tbody key={area}>
            <tr>
              <th scope="colgroup" colSpan={roles.length + 1} className={styles.area}>
                {area === "whatsapp" ? "WhatsApp" : humanize(area)}
              </th>
            </tr>
            {PERMISSIONS.filter((p) => p.startsWith(`${area}.`)).map((p) => (
              <tr key={p}>
                <th scope="row" className={styles.perm}>
                  {PERMISSION_LABELS[p]}
                  <span className={cell.sub}>{p}</span>
                </th>
                {roles.map((r) => {
                  const locked = r.key === "SUPER_ADMIN";
                  return (
                    <td key={r.id} className={styles.check}>
                      <input
                        type="checkbox"
                        checked={locked || (draft[r.id] ?? []).includes(p)}
                        disabled={locked}
                        onChange={() => toggle(r.id, p)}
                        aria-label={`${ROLE_LABELS[r.key]}: ${PERMISSION_LABELS[p]}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        ))}
      </Table>
    </Panel>
  );
}
