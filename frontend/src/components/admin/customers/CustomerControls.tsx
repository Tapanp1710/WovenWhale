"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { customerUpdateSchema, type AdminCustomerDetailDTO } from "@wovenwhale/backend/contracts";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { api } from "@/lib/api/client";
import { serverErrors, useAction, useCan } from "../AdminContext";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import styles from "./CustomerControls.module.css";

type Input = z.input<typeof customerUpdateSchema>;

/** Edit contact details and block/unblock. Blocking signs the customer out and stops new orders. */
export function CustomerControls({ customer }: { customer: AdminCustomerDetailDTO }) {
  const canManage = useCan("customers.manage");
  const { run, pending } = useAction();
  const [editing, setEditing] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const form = useForm<Input, unknown, z.output<typeof customerUpdateSchema>>({
    resolver: zodResolver(customerUpdateSchema),
    defaultValues: { fullName: customer.fullName ?? "", email: customer.email ?? "" },
  });
  if (!canManage) return null;
  const url = `/admin/customers/${customer.id}`;

  const submit = form.handleSubmit(async (values) => {
    const ok = await run(() => api(url, { method: "PATCH", body: values }), "Customer updated", serverErrors(form.setError));
    if (ok) setEditing(false);
  });

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
        Edit details
      </Button>
      {customer.isBlocked ? (
        <Button
          size="sm"
          variant="secondary"
          loading={pending}
          onClick={() => run(() => api(url, { method: "PATCH", body: { isBlocked: false } }), "Customer unblocked")}
        >
          Unblock
        </Button>
      ) : (
        <Button size="sm" variant="danger" onClick={() => setBlocking(true)}>
          Block
        </Button>
      )}

      <ConfirmDialog
        open={blocking}
        onOpenChange={setBlocking}
        title={`Block ${customer.fullName ?? "this customer"}?`}
        description="They won't be able to sign in or place orders until you unblock them. Existing orders are not affected."
        confirmLabel="Block customer"
        onConfirm={() => run(() => api(url, { method: "PATCH", body: { isBlocked: true } }), "Customer blocked")}
      />
      <Sheet
        open={editing}
        onOpenChange={setEditing}
        side="center"
        title="Edit customer"
        footer={
          <div className={styles.footer}>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button type="submit" form="customer-form" loading={form.formState.isSubmitting}>
              Save
            </Button>
          </div>
        }
      >
        <form id="customer-form" className={styles.form} onSubmit={submit} noValidate>
          <TextField label="Full name" error={form.formState.errors.fullName?.message} {...form.register("fullName")} />
          <TextField
            label="Email"
            type="email"
            optional
            error={form.formState.errors.email?.message}
            {...form.register("email", { setValueAs: (v: unknown) => (v === "" ? null : v) })}
          />
          <p className={styles.hint}>The phone number is the customer&apos;s sign-in and can&apos;t be changed here.</p>
        </form>
      </Sheet>
    </>
  );
}
