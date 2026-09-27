"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { REFUND_METHODS, refundApproveSchema, type AdminReturnRowDTO } from "@wovenwhale/backend/contracts";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { api } from "@/lib/api/client";
import { formatINR } from "@/lib/format";
import { serverErrors, useAction } from "../AdminContext";
import { REFUND_METHOD_LABELS } from "../orders/RefundsTable";
import styles from "./ReturnDialogs.module.css";

type Input = z.input<typeof refundApproveSchema>;

/**
 * Issues the refund. The amount defaults to the server-computed refundable
 * value; COD orders can only be refunded by bank transfer or UPI.
 */
export function RefundDialog({ ret, onClose }: { ret: AdminReturnRowDTO; onClose: () => void }) {
  const { run } = useAction();
  const cod = ret.paymentMethod === "COD";
  const max = ret.refundablePaise / 100;
  const form = useForm<Input, unknown, Input>({
    resolver: zodResolver(refundApproveSchema, undefined, { raw: true }),
    defaultValues: { method: cod ? "UPI" : "ORIGINAL_PAYMENT", amount: max, note: "" },
  });
  const e = form.formState.errors;

  const submit = form.handleSubmit(async (values) => {
    if (Number(values.amount) > max) {
      form.setError("amount", { message: `Refund can't exceed ${formatINR(ret.refundablePaise)}.` });
      return;
    }
    const body = { ...values, amount: values.amount === "" ? undefined : values.amount, note: values.note || undefined };
    if (await run(() => api(`/admin/returns/${ret.id}/refund`, { method: "POST", body }), "Refund approved", serverErrors(form.setError)))
      onClose();
  });

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      side="center"
      title={`Refund ${ret.returnNumber}`}
      description={`Up to ${formatINR(ret.refundablePaise)} can be refunded for these items.`}
      footer={
        <div className={styles.footer}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="refund-form" loading={form.formState.isSubmitting}>
            Approve refund
          </Button>
        </div>
      }
    >
      <form id="refund-form" className={styles.form} onSubmit={submit} noValidate>
        <SelectField
          label="Method"
          hint={cod ? "Cash on delivery orders are refunded by bank transfer or UPI, then marked as paid." : undefined}
          error={e.method?.message}
          {...form.register("method")}
        >
          {REFUND_METHODS.map((m) => (
            <option key={m} value={m} disabled={cod && m === "ORIGINAL_PAYMENT"}>
              {REFUND_METHOD_LABELS[m]}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Amount (₹)"
          type="number"
          inputMode="decimal"
          min={0}
          max={max}
          step="0.01"
          error={e.amount?.message}
          {...form.register("amount")}
        />
        <TextAreaField label="Note" optional rows={2} error={e.note?.message} {...form.register("note")} />
      </form>
    </Sheet>
  );
}
