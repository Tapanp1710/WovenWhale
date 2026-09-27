"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { orderNoteSchema, type AdminOrderDetailDTO } from "@wovenwhale/backend/contracts";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/Button";
import { TextAreaField } from "@/components/ui/Field";
import { api } from "@/lib/api/client";
import { formatDateTime } from "@/lib/format";
import { serverErrors, useAction } from "../AdminContext";
import styles from "./NotesPanel.module.css";

/** Internal notes; never shown to the customer. */
export function NotesPanel({ orderId, notes }: { orderId: string; notes: AdminOrderDetailDTO["notes"] }) {
  const { run } = useAction();
  const form = useForm<z.input<typeof orderNoteSchema>, unknown, z.output<typeof orderNoteSchema>>({
    resolver: zodResolver(orderNoteSchema),
    defaultValues: { body: "" },
  });

  const submit = form.handleSubmit(async (values) => {
    const ok = await run(
      () => api(`/admin/orders/${orderId}/notes`, { method: "POST", body: values }),
      "Note added",
      serverErrors(form.setError),
    );
    if (ok) form.reset();
  });

  return (
    <div className={styles.wrap}>
      {notes.length > 0 && (
        <ul className={styles.notes}>
          {notes.map((n) => (
            <li key={n.id} className={styles.note}>
              <p>{n.body}</p>
              <p className={styles.meta}>
                {n.author} · {formatDateTime(n.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className={styles.form} noValidate>
        <TextAreaField label="Add a note" rows={2} error={form.formState.errors.body?.message} {...form.register("body")} />
        <Button type="submit" size="sm" variant="secondary" loading={form.formState.isSubmitting}>
          Save note
        </Button>
      </form>
    </div>
  );
}
