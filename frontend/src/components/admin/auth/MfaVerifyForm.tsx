"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { mfaVerifySchema } from "@wovenwhale/backend/contracts";
import { CircleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import styles from "./LoginForm.module.css";

type Input = z.input<typeof mfaVerifySchema>;

/** Second sign-in step: a code from the authenticator app, or a recovery code. */
export function MfaVerifyForm({ next }: { next: string }) {
  const router = useRouter();
  const [alert, setAlert] = useState<string | null>(null);
  const form = useForm<Input, unknown, z.output<typeof mfaVerifySchema>>({
    resolver: zodResolver(mfaVerifySchema),
    defaultValues: { method: "totp", code: "" },
  });
  const method = form.watch("method");
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    setAlert(null);
    try {
      await api("/admin/auth/2fa/verify", { method: "POST", body: values });
      router.replace(next);
      router.refresh();
    } catch (error) {
      form.resetField("code");
      setAlert(errorMessage(error));
    }
  });

  const switchMethod = () => {
    form.reset({ method: method === "totp" ? "recovery" : "totp", code: "" });
    setAlert(null);
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      {alert && (
        <div className={styles.alert} role="alert">
          <CircleAlert size={18} aria-hidden="true" />
          <p>{alert}</p>
        </div>
      )}
      {method === "totp" ? (
        <TextField
          key="totp"
          label="Authenticator code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          hint="The 6-digit code in your authenticator app."
          error={errors.code?.message}
          {...form.register("code")}
        />
      ) : (
        <TextField
          key="recovery"
          label="Recovery code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={11}
          autoFocus
          hint="Each recovery code works once."
          error={errors.code?.message}
          {...form.register("code")}
        />
      )}
      <Button type="submit" size="lg" fullWidth loading={isSubmitting}>
        Verify
      </Button>
      <Button type="button" variant="ghost" fullWidth onClick={switchMethod}>
        {method === "totp" ? "Use a recovery code instead" : "Use the authenticator app instead"}
      </Button>
    </form>
  );
}
