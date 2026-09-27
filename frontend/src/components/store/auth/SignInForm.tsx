"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { sendOtpSchema, verifyOtpSchema, type CustomerDTO } from "@wovenwhale/backend/contracts";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { api } from "@/lib/api/client";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { formatPhone } from "@/lib/format";
import styles from "./SignInForm.module.css";

type PhoneInput = z.input<typeof sendOtpSchema>;
type CodeInput = { code: string };

/**
 * Passwordless sign-in: mobile number → one-time code. The OTP provider is
 * swappable server-side; this form only speaks to /api/auth.
 */
export function SignInForm({ onSignedIn }: { onSignedIn: (customer: CustomerDTO, isNew: boolean) => void }) {
  const [phone, setPhone] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  const phoneForm = useForm<PhoneInput>({ resolver: zodResolver(sendOtpSchema) });
  const codeForm = useForm<CodeInput>({ resolver: zodResolver(verifyOtpSchema.pick({ code: true })) });

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function requestCode(values: { phone: string }) {
    try {
      const res = await api<{ resendInSeconds: number }>("/auth/otp/send", { method: "POST", body: values });
      setPhone(values.phone);
      setResendIn(res.resendInSeconds);
      codeForm.reset();
    } catch (error) {
      phoneForm.setError("phone", { message: errorMessage(error) });
    }
  }

  async function verify(values: CodeInput) {
    try {
      const res = await api<{ customer: CustomerDTO; isNew: boolean }>("/auth/otp/verify", {
        method: "POST",
        body: { phone, code: values.code },
      });
      onSignedIn(res.customer, res.isNew);
    } catch (error) {
      codeForm.setError("code", { message: error instanceof ApiError ? error.message : errorMessage(error) });
    }
  }

  return (
    <div className={styles.wrap}>
      <AnimatePresence mode="wait" initial={false}>
        {!phone ? (
          <motion.form
            key="phone"
            className={styles.form}
            onSubmit={phoneForm.handleSubmit((v) => requestCode(v as { phone: string }))}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2 }}
            noValidate
          >
            <p className={styles.lede}>Sign in or create an account with your mobile number. We&apos;ll send you a one-time code.</p>
            <TextField
              label="Mobile number"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="98765 43210"
              error={phoneForm.formState.errors.phone?.message}
              {...phoneForm.register("phone")}
            />
            <Button type="submit" fullWidth size="lg" loading={phoneForm.formState.isSubmitting}>
              Send code
            </Button>
          </motion.form>
        ) : (
          <motion.form
            key="code"
            className={styles.form}
            onSubmit={codeForm.handleSubmit(verify)}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.2 }}
            noValidate
          >
            <p className={styles.lede}>
              Enter the 6-digit code sent to <strong>{formatPhone(phone)}</strong>.{" "}
              <button type="button" className={styles.inline} onClick={() => setPhone(null)}>
                Change number
              </button>
            </p>
            <TextField
              label="Verification code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className={styles.code}
              autoFocus
              error={codeForm.formState.errors.code?.message}
              {...codeForm.register("code")}
            />
            <Button type="submit" fullWidth size="lg" loading={codeForm.formState.isSubmitting}>
              Verify and continue
            </Button>
            <p className={styles.resend}>
              {resendIn > 0 ? (
                <>Resend code in {resendIn}s</>
              ) : (
                <button type="button" className={styles.inline} onClick={() => requestCode({ phone })}>
                  Resend code
                </button>
              )}
            </p>
          </motion.form>
        )}
      </AnimatePresence>
      <p className={styles.fine}>By continuing you agree to our Terms and Privacy Policy.</p>
    </div>
  );
}
