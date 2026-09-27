"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { variantUpsertSchema, type AdminProductDetailDTO } from "@wovenwhale/backend/contracts";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Checkbox, TextField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { api } from "@/lib/api/client";
import { serverErrors, useAction } from "../AdminContext";
import styles from "./VariantDialog.module.css";

type Variant = AdminProductDetailDTO["variants"][number];
type Input = z.input<typeof variantUpsertSchema>;

const emptyToNull = (v: unknown) => (v === "" || v === null ? null : v);

/** Add or edit one size. Opening stock is only accepted when creating. */
export function VariantDialog({
  productId,
  productSku,
  variant,
  nextSort,
  open,
  onOpenChange,
}: {
  productId: string;
  productSku: string;
  variant: Variant | null;
  nextSort: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { run } = useAction();
  const form = useForm<Input, unknown, Input>({
    resolver: zodResolver(variantUpsertSchema, undefined, { raw: true }),
    defaultValues: {
      size: variant?.size ?? "",
      color: variant?.color ?? "",
      sku: variant?.sku ?? `${productSku}-`,
      price: variant?.pricePaiseOverride != null ? variant.pricePaiseOverride / 100 : "",
      mrp: variant?.mrpPaiseOverride != null ? variant.mrpPaiseOverride / 100 : "",
      sortOrder: variant?.sortOrder ?? nextSort,
      isActive: variant?.isActive ?? true,
      initialStock: variant ? undefined : 0,
    },
  });
  const e = form.formState.errors;

  const submit = form.handleSubmit(async (values) => {
    const body = variant ? { ...values, initialStock: undefined } : values;
    const ok = await run(
      () =>
        api(variant ? `/admin/catalog/variants/${variant.id}` : `/admin/catalog/products/${productId}/variants`, {
          method: variant ? "PUT" : "POST",
          body,
        }),
      variant ? `Size ${values.size} saved` : `Size ${values.size} added`,
      serverErrors(form.setError),
    );
    if (ok) onOpenChange(false);
  });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={variant ? `Edit size ${variant.size}` : "Add a size"}
      description="Leave the price fields empty to use the product's price."
      footer={
        <div className={styles.footer}>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="variant-form" loading={form.formState.isSubmitting}>
            {variant ? "Save size" : "Add size"}
          </Button>
        </div>
      }
    >
      <form id="variant-form" className={styles.form} onSubmit={submit} noValidate>
        <div className={styles.row}>
          <TextField label="Size" placeholder="M" autoCapitalize="characters" error={e.size?.message} {...form.register("size")} />
          <TextField label="Colour" optional error={e.color?.message} {...form.register("color")} />
        </div>
        <TextField label="SKU" autoCapitalize="characters" error={e.sku?.message} {...form.register("sku")} />
        <div className={styles.row}>
          <TextField
            label="Price override (₹)"
            optional
            type="number"
            inputMode="decimal"
            min={0}
            error={e.price?.message}
            {...form.register("price", { setValueAs: emptyToNull })}
          />
          <TextField
            label="MRP override (₹)"
            optional
            type="number"
            inputMode="decimal"
            min={0}
            error={e.mrp?.message}
            {...form.register("mrp", { setValueAs: emptyToNull })}
          />
        </div>
        <div className={styles.row}>
          <TextField label="Sort order" type="number" inputMode="numeric" error={e.sortOrder?.message} {...form.register("sortOrder")} />
          {!variant && (
            <TextField
              label="Opening stock"
              type="number"
              inputMode="numeric"
              min={0}
              hint="Recorded as stock in."
              error={e.initialStock?.message}
              {...form.register("initialStock")}
            />
          )}
        </div>
        <Checkbox label="Available for sale" {...form.register("isActive")} />
        {variant && <p className={styles.hint}>To change stock for this size, use Inventory so every movement is recorded.</p>}
      </form>
    </Sheet>
  );
}
