"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ADMIN_ROLES, adminCreateSchema, type AdminRole, type AdminUserDTO } from "@wovenwhale/backend/contracts";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { api } from "@/lib/api/client";
import { formatDateTime } from "@/lib/format";
import { serverErrors, useAction, useAdmin } from "../AdminContext";
import { ROLE_LABELS } from "../labels";
import { Badge } from "../ui/Badge";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { PageHeader } from "../ui/PageHeader";
import { Panel } from "../ui/Panel";
import { cell, Table } from "../ui/Table";
import styles from "./AdminUsers.module.css";

/** Admin accounts: create, change role, deactivate. Changing role or deactivating signs the admin out. */
export function AdminUsers({ admins }: { admins: AdminUserDTO[] }) {
  const me = useAdmin();
  const { run, pending } = useAction();
  const [creating, setCreating] = useState(false);
  const [deactivating, setDeactivating] = useState<AdminUserDTO | null>(null);

  const patch = (a: AdminUserDTO, body: { role?: AdminRole; isActive?: boolean }, message: string) =>
    run(() => api(`/admin/admins/${a.id}`, { method: "PATCH", body }), message);

  return (
    <>
      <PageHeader
        title="Admin users"
        description="People who can sign in to this console. What each role can do is set on the Roles page."
        actions={
          <Button size="sm" onClick={() => setCreating(true)} icon={<Plus size={16} aria-hidden="true" />}>
            Add admin
          </Button>
        }
      />
      <Panel flush>
        <Table label="Admin users" minWidth={820}>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Role</th>
              <th scope="col">Last sign-in</th>
              <th scope="col">Two-factor</th>
              <th scope="col">Status</th>
              <th scope="col" className={cell.actions}>
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => {
              const self = a.id === me.id;
              return (
                <tr key={a.id}>
                  <td>
                    <span className={cell.strong}>{a.fullName}</span>
                    {self && <span className={styles.you}> (you)</span>}
                    <span className={cell.sub}>{a.email}</span>
                  </td>
                  <td>
                    <select
                      className={styles.select}
                      value={a.role}
                      disabled={self || pending}
                      aria-label={`Role for ${a.fullName}`}
                      onChange={(e) =>
                        patch(a, { role: e.target.value as AdminRole }, `${a.fullName} is now ${ROLE_LABELS[e.target.value as AdminRole]}`)
                      }
                    >
                      {ADMIN_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={cell.nowrap}>{a.lastLoginAt ? formatDateTime(a.lastLoginAt) : "Never"}</td>
                  <td>{a.mfaEnrolled ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}</td>
                  <td>{a.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Deactivated</Badge>}</td>
                  <td className={cell.actions}>
                    {!self &&
                      (a.isActive ? (
                        <Button size="sm" variant="ghost" onClick={() => setDeactivating(a)}>
                          Deactivate
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={pending}
                          onClick={() => patch(a, { isActive: true }, `${a.fullName} reactivated`)}
                        >
                          Reactivate
                        </Button>
                      ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Panel>
      <ConfirmDialog
        open={deactivating !== null}
        onOpenChange={(o) => !o && setDeactivating(null)}
        title={`Deactivate ${deactivating?.fullName ?? ""}?`}
        description="They are signed out everywhere and can't sign in until reactivated. Their audit history is kept."
        confirmLabel="Deactivate"
        onConfirm={() => patch(deactivating!, { isActive: false }, "Admin deactivated")}
      />
      {creating && <CreateAdminDialog onClose={() => setCreating(false)} />}
    </>
  );
}

function CreateAdminDialog({ onClose }: { onClose: () => void }) {
  const { run } = useAction();
  const form = useForm<z.input<typeof adminCreateSchema>, unknown, z.output<typeof adminCreateSchema>>({
    resolver: zodResolver(adminCreateSchema),
    defaultValues: { email: "", fullName: "", role: "SUPPORT", password: "" },
  });
  const e = form.formState.errors;
  const submit = form.handleSubmit(async (values) => {
    if (
      await run(
        () => api("/admin/admins", { method: "POST", body: values }),
        `${values.fullName} can now sign in`,
        serverErrors(form.setError),
      )
    )
      onClose();
  });

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="Add an admin"
      description="Share the temporary password privately; they should change it after signing in."
      footer={
        <div className={styles.footer}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="admin-form" loading={form.formState.isSubmitting}>
            Create admin
          </Button>
        </div>
      }
    >
      <form id="admin-form" className={styles.form} onSubmit={submit} noValidate>
        <TextField label="Full name" autoComplete="off" error={e.fullName?.message} {...form.register("fullName")} />
        <TextField label="Email" type="email" autoComplete="off" error={e.email?.message} {...form.register("email")} />
        <SelectField label="Role" {...form.register("role")}>
          {ADMIN_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Temporary password"
          type="password"
          autoComplete="new-password"
          hint="At least 12 characters with upper and lower case letters and a number."
          error={e.password?.message}
          {...form.register("password")}
        />
      </form>
    </Sheet>
  );
}
