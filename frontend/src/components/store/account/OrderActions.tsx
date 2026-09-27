"use client";

import type { OrderDetailDTO } from "@wovenwhale/backend/contracts";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { TextAreaField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toaster";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/format";
import { PaymentGateway, type GatewayResult, type PaymentSession } from "../checkout/PaymentGateway";
import { ProcessingOverlay } from "../checkout/ProcessingOverlay";
import styles from "./OrderActions.module.css";

const CANCEL_REASONS = [
  "Ordered by mistake",
  "Found a better price",
  "Delivery is taking too long",
  "Want to change size or item",
  "Other",
];

/**
 * Customer actions on an order. Whether each action is allowed is decided by
 * the server (canCancel, cancelDeadlineAt); the UI only reflects it.
 */
export function OrderActions({ order }: { order: OrderDetailDTO }) {
  const router = useRouter();
  const toast = useToast();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState(CANCEL_REASONS[0]!);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentSession | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  async function cancel(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/orders/${order.orderNumber}/cancel`, {
        method: "POST",
        body: { reason: reason === "Other" ? detail || "Other" : reason },
      });
      setCancelOpen(false);
      toast.success(order.paymentStatus === "PAYMENT_SUCCESS" ? "Order cancelled. Your refund has been started." : "Order cancelled.");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function startPayment() {
    setBusy(true);
    try {
      setPayment(await api<PaymentSession>(`/payments/${order.orderNumber}/retry`, { method: "POST" }));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onPayment(result: GatewayResult) {
    setPayment(null);
    if (result.status !== "success") {
      if (result.status === "failed") toast.error(result.message);
      return;
    }
    setProcessing("Confirming your payment");
    try {
      await api("/payments/verify", { method: "POST", body: { orderNumber: order.orderNumber, payload: result.payload } });
      toast.success("Payment received. Your order is confirmed.");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setProcessing(null);
    }
  }

  const awaitingPayment = order.status === "PENDING_PAYMENT";
  if (!order.canCancel && !awaitingPayment) return null;

  return (
    <div className={styles.actions}>
      {awaitingPayment && (
        <div className={styles.notice}>
          <p>
            We haven&apos;t received payment for this order yet
            {order.paymentExpiresAt ? `. Complete it by ${formatDateTime(order.paymentExpiresAt)} to keep your items.` : "."}
          </p>
          <Button onClick={() => void startPayment()} loading={busy && !cancelOpen}>
            Complete payment
          </Button>
        </div>
      )}
      {order.canCancel && (
        <div className={styles.cancel}>
          <p className={styles.deadline}>You can cancel this order until {formatDateTime(order.cancelDeadlineAt)}.</p>
          <Button variant="secondary" onClick={() => setCancelOpen(true)}>
            Cancel order
          </Button>
        </div>
      )}

      <Sheet open={cancelOpen} onOpenChange={setCancelOpen} title={`Cancel order ${order.orderNumber}?`} side="center">
        <form className={styles.form} onSubmit={cancel}>
          <fieldset className={styles.reasons}>
            <legend>Why are you cancelling?</legend>
            {CANCEL_REASONS.map((r) => (
              <label key={r}>
                <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} />
                {r}
              </label>
            ))}
          </fieldset>
          {reason === "Other" && (
            <TextAreaField label="Tell us more" optional value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={300} />
          )}
          {order.paymentStatus === "PAYMENT_SUCCESS" && (
            <p className={styles.refund}>Your payment will be refunded to the original payment method.</p>
          )}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.buttons}>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              Keep order
            </Button>
            <Button type="submit" variant="danger" loading={busy}>
              Cancel order
            </Button>
          </div>
        </form>
      </Sheet>

      <PaymentGateway session={payment} onResult={(r) => void onPayment(r)} />
      <ProcessingOverlay message={processing} />
    </div>
  );
}
