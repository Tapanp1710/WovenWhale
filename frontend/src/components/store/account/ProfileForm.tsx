"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { profileUpdateSchema, type CustomerDTO } from "@wovenwhale/backend/contracts";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Checkbox, TextField } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toaster";
import { api } from "@/lib/api/client";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { formatPhone } from "@/lib/format";
import { useSession } from "../providers/SessionProvider";
import styles from "./ProfileForm.module.css";

type Input = z.input<typeof profileUpdateSchema>;
type Output = z.output<typeof profileUpdateSchema>;

export function ProfileForm({ customer }: { customer: CustomerDTO }) {
  const { setCustomer } = useSession();
  const toast = useToast();
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: {
      fullName: customer.fullName ?? "",
      email: customer.email ?? "",
      whatsappOptIn: customer.whatsappOptIn,
      marketingOptIn: customer.marketingOptIn,
    },
  });
  const { errors, isSubmitting, isDirty } = form.formState;

  async function submit(values: Output) {
    try {
      const res = await api<{ customer: CustomerDTO }>("/auth/profile", { method: "PATCH", body: values });
      setCustomer(res.customer);
      form.reset(form.getValues());
      toast.success("Profile saved.");
    } catch (error) {
      if (error instanceof ApiError && error.code === "EMAIL_IN_USE") form.setError("email", { message: error.message });
      else toast.error(errorMessage(error));
    }
  }

  return (
    <form className={styles.form} onSubmit={form.handleSubmit(submit)} noValidate>
      <div className={styles.grid}>
        <TextField label="Full name" autoComplete="name" error={errors.fullName?.message} {...form.register("fullName")} />
        <TextField label="Email" type="email" autoComplete="email" optional error={errors.email?.message} {...form.register("email")} />
        <TextField
          label="Mobile number"
          value={formatPhone(customer.phone)}
          readOnly
          hint="Your mobile number is your sign-in. Contact support to change it."
        />
      </div>
      <div className={styles.prefs}>
        <Checkbox label="Send order updates on WhatsApp" {...form.register("whatsappOptIn")} />
        <Checkbox label="Tell me about new weaves and offers" {...form.register("marketingOptIn")} />
      </div>
      <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
        Save changes
      </Button>
    </form>
  );
}
