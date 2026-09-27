"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { inventoryAdjustSchema, type InventoryRowDTO } from "@wovenwhale/backend/contracts";
import { useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { api } from "@/lib/api/client";
import { serverErrors, useAction } from "../AdminContext";
import styles from "./AdjustDialog.module.css";

type Input = z.input<typeof inventoryAdjustSchema>;

const TYPE_HELP: Record<Input["type"], string> = {
  STOCK_IN: "New units received. Enter a positive number.",
  MANUAL_ADJUSTMENT: "Damaged, lost or found units. Use a minus sign to remove, for example -2.",
  STOCK_CORRECTION: "Fix a counting error after a stock take. Use a minus sign to remove.",
};

export function AdjustDialog({ row, onClose }: { row: InventoryRowDTO; onClose: () => void }) {
  const { run } = useAction();
  const form = useForm<Input, unknown, Input>({
    resolver: zodResolver(inventoryAdjustSchema, undefined, { raw: true }),
    defaultValues: { type: "STOCK_IN", quantity: "", note: "", lowStockThreshold: row.lowStockThreshold },
  });
  const e = form.formState.errors;
  const [type, quantity] = useWatch({ control: form.control, name: ["type", "quantity"] });
  const delta = Number(quantity) || 0;
  const after = row.onHand + delta;

  const submit = form.handleSubmit(async (values) => {
    const ok = await run(
      () => api(`/admin/inventory/${row.variantId}/adjust`, { method: "POST", body: values }),
      `Stock updated for ${row.sku}`,
      serverErrors(form.setError),
    );
    if (ok) onClose();
  });

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      side="center"
      title="Adjust stock"
      description={`${row.productName}, size ${row.size} (${row.sku})`}
      footer={
        <div className={styles.footer}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="adjust-form" loading={form.formState.isSubmitting}>
            Save adjustment
          </Button>
        </div>
      }
    >
      <form id="adjust-form" className={styles.form} onSubmit={submit} noValidate>
        <SelectField label="Type" hint={TYPE_HELP[type]} {...form.register("type")}>
          <option value="STOCK_IN">Stock in</option>
          <option value="MANUAL_ADJUSTMENT">Manual adjustment</option>
          <option value="STOCK_CORRECTION">Stock correction</option>
        </SelectField>
        <TextField label="Quantity" type="number" inputMode="numeric" step={1} error={e.quantity?.message} {...form.register("quantity")} />
        <p className={styles.preview} aria-live="polite">
          On hand: <strong>{row.onHand}</strong> → <strong className={after < row.reserved ? styles.bad : undefined}>{after}</strong>
          {after < row.reserved && " (below reserved units)"}
        </p>
        <TextAreaField label="Note" rows={2} placeholder="Why is stock changing?" error={e.note?.message} {...form.register("note")} />
        <TextField
          label="Low-stock threshold"
          type="number"
          inputMode="numeric"
          min={0}
          hint="Flag this size when available units fall to this number."
          error={e.lowStockThreshold?.message}
          {...form.register("lowStockThreshold")}
        />
      </form>
    </Sheet>
  );
}
