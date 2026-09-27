"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { SUPPORT_TOPICS, supportRequestSchema } from "@wovenwhale/backend/contracts";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { useSession } from "../providers/SessionProvider";
import styles from "./SupportForm.module.css";

type Input = z.input<typeof supportRequestSchema>;
type Output = z.output<typeof supportRequestSchema>;

const TOPIC_LABEL: Record<(typeof SUPPORT_TOPICS)[number], string> = {
  ORDER: "An order",
  RETURN: "A return or exchange",
  PRODUCT: "A product",
  SIZING: "Sizing and fit",
  PAYMENT: "Payment or refund",
  OTHER: "Something else",
};

export function SupportForm({ orderNumber }: { orderNumber?: string }) {
  const { customer } = useSession();
  const [sent, setSent] = useState(false);
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(supportRequestSchema),
    defaultValues: {
      name: customer?.fullName ?? "",
      email: customer?.email ?? "",
      phone: customer?.phone.replace(/^\+91/, "") ?? undefined,
      orderNumber: orderNumber ?? "",
      topic: orderNumber ? "ORDER" : "OTHER",
      message: "",
    },
  });
  const { errors, isSubmitting } = form.formState;

  async function submit(values: Output) {
    try {
      await api("/support", { method: "POST", body: values });
      setSent(true);
    } catch (error) {
      form.setError("root", { message: errorMessage(error) });
    }
  }

  if (sent) {
    return (
      <div className={styles.sent} role="status">
        <CheckCircle2 size={28} aria-hidden="true" />
        <p className={styles.sentTitle}>Message sent</p>
        <p>Our team will reply to the email or phone number you gave us.</p>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={form.handleSubmit(submit)} noValidate>
      <div className={styles.grid}>
        <TextField label="Name" autoComplete="name" error={errors.name?.message} {...form.register("name")} />
        <TextField label="Email" type="email" autoComplete="email" optional error={errors.email?.message} {...form.register("email")} />
        <TextField
          label="Mobile number"
          type="tel"
          autoComplete="tel-national"
          optional
          error={errors.phone?.message}
          {...form.register("phone", { setValueAs: (v: string) => (v ? v : undefined) })}
        />
        <TextField label="Order number" optional error={errors.orderNumber?.message} {...form.register("orderNumber")} />
      </div>
      <SelectField label="What can we help with?" error={errors.topic?.message} {...form.register("topic")}>
        {SUPPORT_TOPICS.map((t) => (
          <option key={t} value={t}>
            {TOPIC_LABEL[t]}
          </option>
        ))}
      </SelectField>
      <TextAreaField label="Message" error={errors.message?.message} rows={5} {...form.register("message")} />
      {errors.root && (
        <p className={styles.error} role="alert">
          {errors.root.message}
        </p>
      )}
      <Button type="submit" loading={isSubmitting}>
        Send message
      </Button>
    </form>
  );
}
