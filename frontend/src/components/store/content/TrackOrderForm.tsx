"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ORDER_PROGRESS, ORDER_STATUS_LABELS, trackOrderSchema, type TrackOrderDTO } from "@wovenwhale/backend/contracts";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { formatDate, formatDateTime } from "@/lib/format";
import { OrderStatusBadge } from "../account/StatusBadge";
import styles from "./TrackOrderForm.module.css";

type Input = z.input<typeof trackOrderSchema>;
type Output = z.output<typeof trackOrderSchema>;

export function TrackOrderForm() {
  const [result, setResult] = useState<TrackOrderDTO | null>(null);
  const form = useForm<Input, unknown, Output>({ resolver: zodResolver(trackOrderSchema) });
  const { errors, isSubmitting } = form.formState;

  async function submit(values: Output) {
    setResult(null);
    try {
      setResult(await api<TrackOrderDTO>("/track", { method: "POST", body: values }));
    } catch (error) {
      form.setError("root", { message: errorMessage(error) });
    }
  }

  const currentIndex = result ? ORDER_PROGRESS.indexOf(result.status) : -1;

  return (
    <div className={styles.wrap}>
      <form className={styles.form} onSubmit={form.handleSubmit(submit)} noValidate>
        <TextField
          label="Order number"
          placeholder="WW…"
          autoCapitalize="characters"
          error={errors.orderNumber?.message}
          {...form.register("orderNumber")}
        />
        <TextField
          label="Mobile number used on the order"
          type="tel"
          autoComplete="tel-national"
          error={errors.phone?.message}
          {...form.register("phone")}
        />
        {errors.root && (
          <p className={styles.error} role="alert">
            {errors.root.message}
          </p>
        )}
        <Button type="submit" loading={isSubmitting}>
          Track order
        </Button>
      </form>

      <AnimatePresence>
        {result && (
          <motion.section
            className={styles.result}
            aria-live="polite"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <div className={styles.head}>
              <h2>Order {result.orderNumber}</h2>
              <OrderStatusBadge status={result.status} />
            </div>
            <p className={styles.muted}>
              Placed {formatDate(result.placedAt)}, {result.itemCount} {result.itemCount === 1 ? "item" : "items"}, delivering to{" "}
              {result.city}.
            </p>
            {currentIndex >= 0 && (
              <ol className={styles.steps}>
                {ORDER_PROGRESS.map((s, i) => (
                  <li key={s} data-state={i < currentIndex ? "done" : i === currentIndex ? "current" : "todo"}>
                    {ORDER_STATUS_LABELS[s]}
                  </li>
                ))}
              </ol>
            )}
            {result.shipments.map((s) => (
              <div key={s.id} className={styles.shipment}>
                <p>
                  {s.courierName}, AWB {s.awb}
                  {s.trackingUrl && (
                    <>
                      {" "}
                      <a href={s.trackingUrl} target="_blank" rel="noopener noreferrer">
                        Track with courier
                      </a>
                    </>
                  )}
                </p>
                <ul>
                  {s.events
                    .slice()
                    .reverse()
                    .map((e, i) => (
                      <li key={i}>
                        {formatDateTime(e.occurredAt)}: {e.description || e.status.toLowerCase().replace(/_/g, " ")}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
