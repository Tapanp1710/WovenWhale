"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { adminLoginSchema, type AdminLoginStep } from "@wovenwhale/backend/contracts";
import { CircleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { api } from "@/lib/api/client";
import { ApiError, errorMessage } from "@/lib/api/errors";
import styles from "./LoginForm.module.css";

type Input = z.input<typeof adminLoginSchema>;

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [alert, setAlert] = useState<string | null>(null);
  const form = useForm<Input, unknown, z.output<typeof adminLoginSchema>>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: { email: "", password: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    setAlert(null);
    try {
      const { step } = await api<{ step: AdminLoginStep }>("/admin/auth/login", { method: "POST", body: values });
      const query = `?next=${encodeURIComponent(next)}`;
      if (step === "verify") return router.push(`/admin/login/verify${query}`);
      if (step === "enroll") return router.push(`/admin/login/setup${query}`);
      router.replace(next);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.code === "VALIDATION_ERROR") {
        for (const [name, message] of Object.entries(error.fields)) form.setError(name as keyof Input, { message });
      }
      setAlert(errorMessage(error));
    }
  });

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      {alert && (
        <div className={styles.alert} role="alert">
          <CircleAlert size={18} aria-hidden="true" />
          <p>{alert}</p>
        </div>
      )}
      <TextField label="Email" type="email" autoComplete="username" autoFocus error={errors.email?.message} {...form.register("email")} />
      <TextField
        label="Password"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...form.register("password")}
      />
      <Button type="submit" size="lg" fullWidth loading={isSubmitting}>
        Sign in
      </Button>
    </form>
  );
}
