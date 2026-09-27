"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { shipmentCreateSchema } from "@wovenwhale/backend/contracts";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { api } from "@/lib/api/client";
import { serverErrors, useAction } from "../AdminContext";
import styles from "./ShipDialog.module.css";

type Input = z.input<typeof shipmentCreateSchema>;

/** Records the courier hand-over; the API marks the order as shipped. */
export function ShipDialog({ open, onOpenChange, orderId }: { open: boolean; onOpenChange: (o: boolean) => void; orderId: string }) {
  const { run } = useAction();
  const form = useForm<Input, unknown, z.output<typeof shipmentCreateSchema>>({
    resolver: zodResolver(shipmentCreateSchema),
    defaultValues: { courierName: "", awb: "", trackingUrl: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    const ok = await run(
      () => api(`/admin/orders/${orderId}/shipments`, { method: "POST", body: values }),
      "Order marked as shipped",
      serverErrors(form.setError),
    );
    if (ok) {
      form.reset();
      onOpenChange(false);
    }
  });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      side="center"
      title="Ship order"
      description="Add the courier details. The customer gets the tracking link."
      footer={
        <div className={styles.footer}>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Not yet
          </Button>
          <Button type="submit" form="ship-form" loading={isSubmitting}>
            Mark as shipped
          </Button>
        </div>
      }
    >
      <form id="ship-form" className={styles.form} onSubmit={submit} noValidate>
        <TextField label="Courier" placeholder="Delhivery" error={errors.courierName?.message} {...form.register("courierName")} />
        <TextField label="AWB number" autoCapitalize="characters" error={errors.awb?.message} {...form.register("awb")} />
        <TextField
          label="Tracking link"
          type="url"
          optional
          placeholder="https://"
          error={errors.trackingUrl?.message}
          {...form.register("trackingUrl")}
        />
      </form>
    </Sheet>
  );
}
