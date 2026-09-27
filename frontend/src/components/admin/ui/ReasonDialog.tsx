"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { ZodType } from "zod";
import { Button } from "@/components/ui/Button";
import { TextAreaField, TextField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import styles from "./ReasonDialog.module.css";

type Values = Record<string, string | undefined>;

/**
 * Confirmation dialog with one text field validated by the API's own schema
 * (e.g. codRejectSchema → `reason`). `onConfirm` resolves truthy to close.
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  name,
  label,
  schema,
  confirmLabel,
  danger,
  multiline = true,
  optional,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  name: string;
  label: string;
  schema: ZodType<Values, Values>;
  confirmLabel: string;
  danger?: boolean;
  multiline?: boolean;
  optional?: boolean;
  onConfirm: (values: Values) => Promise<unknown>;
}) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { [name]: "" } });
  const error = form.formState.errors[name]?.message;

  const submit = form.handleSubmit(async (values) => {
    if (await onConfirm(values)) {
      form.reset();
      onOpenChange(false);
    }
  });

  const field = multiline ? (
    <TextAreaField label={label} optional={optional} error={error} rows={3} {...form.register(name)} />
  ) : (
    <TextField label={label} optional={optional} error={error} {...form.register(name)} />
  );

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      side="center"
      title={title}
      description={description}
      footer={
        <div className={styles.footer}>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Keep as is
          </Button>
          <Button type="submit" form={`reason-${name}`} variant={danger ? "danger" : "primary"} loading={form.formState.isSubmitting}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <form id={`reason-${name}`} onSubmit={submit} noValidate>
        {field}
      </form>
    </Sheet>
  );
}
