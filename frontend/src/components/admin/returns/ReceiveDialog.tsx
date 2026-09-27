"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { returnTransitionSchema } from "@wovenwhale/backend/contracts";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Checkbox, TextAreaField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { api } from "@/lib/api/client";
import { useAction } from "../AdminContext";
import styles from "./ReturnDialogs.module.css";

type Input = z.input<typeof returnTransitionSchema>;

/** Confirms the parcel arrived; restock puts the units back into sellable stock. */
export function ReceiveDialog({ returnId, onClose }: { returnId: string; onClose: () => void }) {
  const { run } = useAction();
  const form = useForm<Input, unknown, z.output<typeof returnTransitionSchema>>({
    resolver: zodResolver(returnTransitionSchema),
    defaultValues: { to: "RECEIVED", note: "", restock: true },
  });
  const submit = form.handleSubmit(async (values) => {
    if (await run(() => api(`/admin/returns/${returnId}/transition`, { method: "POST", body: values }), "Return marked as received"))
      onClose();
  });

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      side="center"
      title="Mark as received"
      description="Check the items before confirming."
      footer={
        <div className={styles.footer}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="receive-form" loading={form.formState.isSubmitting}>
            Confirm received
          </Button>
        </div>
      }
    >
      <form id="receive-form" className={styles.form} onSubmit={submit} noValidate>
        <Checkbox label="Put the items back into sellable stock" {...form.register("restock")} />
        <p className={styles.hint}>Leave unticked for damaged or used items.</p>
        <TextAreaField label="Condition note" optional rows={3} error={form.formState.errors.note?.message} {...form.register("note")} />
      </form>
    </Sheet>
  );
}
