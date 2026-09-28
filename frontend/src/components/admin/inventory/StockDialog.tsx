"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { api } from "@/lib/api/client";
import { useAction } from "../AdminContext";
import styles from "./StockDialog.module.css";

export interface StockVariant {
  variantId: string;
  size: string;
  sku: string;
  onHand: number;
  reserved: number;
}

const REASONS = {
  restock: ["Supplier delivery", "Returned to sellable stock", "Transfer in"],
  adjust: ["Damaged items", "Lost or missing", "Stock count correction", "Found in stock count"],
};

/**
 * Restock (units received) or adjust (damaged, lost, counted) one size. The
 * API applies the change through the inventory ledger and refuses anything
 * that would leave fewer units than are reserved or below zero.
 */
export function StockDialog({
  mode,
  productName,
  variants,
  initialVariantId,
  onClose,
  onDone,
}: {
  mode: "restock" | "adjust";
  productName: string;
  variants: StockVariant[];
  initialVariantId?: string;
  onClose: () => void;
  onDone?: () => void;
}) {
  const { run } = useAction();
  const reasonsId = useId();
  const [variantId, setVariantId] = useState(initialVariantId ?? variants[0]?.variantId ?? "");
  const [direction, setDirection] = useState<"increase" | "decrease">(mode === "restock" ? "increase" : "decrease");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState(mode === "restock" ? REASONS.restock[0]! : "");
  const [errors, setErrors] = useState<{ quantity?: string; reason?: string }>({});
  const [saving, setSaving] = useState(false);

  const variant = variants.find((v) => v.variantId === variantId);
  const qty = Number(quantity);
  const validQty = Number.isInteger(qty) && qty > 0;
  const delta = validQty ? (direction === "decrease" ? -qty : qty) : 0;
  const after = (variant?.onHand ?? 0) + delta;
  const tooLow = variant ? after < variant.reserved || after < 0 : false;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!validQty) next.quantity = "Enter a whole number greater than zero.";
    if (reason.trim().length < 3) next.reason = "Say why stock is changing.";
    setErrors(next);
    if (Object.keys(next).length || !variant || saving) return;
    setSaving(true);
    const ok = await run(
      () =>
        api(`/admin/inventory/${variant.variantId}/adjust`, {
          method: "POST",
          body: { type: mode === "restock" ? "STOCK_IN" : "MANUAL_ADJUSTMENT", quantity: delta, note: reason.trim() },
        }),
      mode === "restock"
        ? `Restocked ${productName} (${variant.size}): ${variant.onHand} → ${after}`
        : `Stock adjusted: ${variant.onHand} → ${after}`,
    );
    setSaving(false);
    if (ok) {
      onDone?.();
      onClose();
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      side="center"
      title={mode === "restock" ? "Restock product" : "Adjust stock"}
      description={productName}
      footer={
        <div className={styles.footer}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="stock-form" loading={saving} disabled={tooLow}>
            {saving ? (mode === "restock" ? "Restocking…" : "Saving…") : mode === "restock" ? "Restock" : "Save adjustment"}
          </Button>
        </div>
      }
    >
      <form id="stock-form" className={styles.form} onSubmit={submit} noValidate>
        {variants.length > 1 ? (
          <SelectField label="Size" value={variantId} onChange={(e) => setVariantId(e.target.value)}>
            {variants.map((v) => (
              <option key={v.variantId} value={v.variantId}>
                {v.size} ({v.sku}): {v.onHand} on hand
              </option>
            ))}
          </SelectField>
        ) : (
          variant && (
            <p className={styles.fixed}>
              Size <strong>{variant.size}</strong> <span className={styles.muted}>({variant.sku})</span>
            </p>
          )
        )}

        {variant && (
          <dl className={styles.levels}>
            <div>
              <dt>Current stock</dt>
              <dd>{variant.onHand}</dd>
            </div>
            <div>
              <dt>Reserved for open orders</dt>
              <dd>{variant.reserved}</dd>
            </div>
          </dl>
        )}

        {mode === "adjust" && (
          <fieldset className={styles.direction}>
            <legend>Change</legend>
            <label>
              <input type="radio" name="direction" checked={direction === "decrease"} onChange={() => setDirection("decrease")} /> Decrease
            </label>
            <label>
              <input type="radio" name="direction" checked={direction === "increase"} onChange={() => setDirection("increase")} /> Increase
            </label>
          </fieldset>
        )}

        <TextField
          label={mode === "restock" ? "Quantity to add" : "Quantity"}
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          autoFocus
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          error={errors.quantity}
        />

        {variant && (
          <p className={tooLow ? `${styles.preview} ${styles.bad}` : styles.preview} aria-live="polite">
            New stock: <strong>{variant.onHand}</strong> → <strong>{validQty ? after : "…"}</strong>
            {tooLow && ` Insufficient stock: ${variant.reserved} unit${variant.reserved === 1 ? " is" : "s are"} reserved.`}
          </p>
        )}

        <TextField
          label="Reason"
          list={reasonsId}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={errors.reason}
          hint="Recorded in the stock history."
        />
        <datalist id={reasonsId}>
          {REASONS[mode].map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
      </form>
    </Sheet>
  );
}
