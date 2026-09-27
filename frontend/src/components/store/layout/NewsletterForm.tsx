"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { newsletterSchema } from "@wovenwhale/backend/contracts";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import styles from "./NewsletterForm.module.css";

type Values = z.input<typeof newsletterSchema>;

export function NewsletterForm({ source = "footer", tone = "dark" }: { source?: string; tone?: "dark" | "light" }) {
  const [done, setDone] = useState(false);
  const form = useForm<Values>({ resolver: zodResolver(newsletterSchema), defaultValues: { email: "", source } });

  async function submit(values: Values) {
    try {
      await api("/newsletter", { method: "POST", body: values });
      setDone(true);
    } catch (error) {
      form.setError("email", { message: errorMessage(error) });
    }
  }

  if (done) {
    return (
      <p className={`${styles.done} ${styles[tone]}`} role="status">
        You&apos;re on the list. New weaves arrive in your inbox first.
      </p>
    );
  }

  const error = form.formState.errors.email?.message;
  return (
    <form className={`${styles.form} ${styles[tone]}`} onSubmit={form.handleSubmit(submit)} noValidate>
      <label htmlFor={`newsletter-${source}`} className="visually-hidden">
        Email address
      </label>
      <div className={styles.row}>
        <input
          id={`newsletter-${source}`}
          type="email"
          autoComplete="email"
          placeholder="Your email address"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `newsletter-${source}-error` : undefined}
          {...form.register("email")}
        />
        <Button
          type="submit"
          variant={tone === "dark" ? "secondary" : "primary"}
          loading={form.formState.isSubmitting}
          className={styles.button}
        >
          Subscribe
        </Button>
      </div>
      {error && (
        <p id={`newsletter-${source}-error`} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
