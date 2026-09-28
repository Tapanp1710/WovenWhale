"use client";

import { CreditCard, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { formatINR } from "@/lib/format";
import styles from "./PaymentGateway.module.css";

export interface PaymentSession {
  provider: string;
  clientCheckout: Record<string, string | number>;
}

export type GatewayResult =
  { status: "success"; payload: Record<string, unknown> } | { status: "failed"; message: string } | { status: "dismissed" };

/**
 * Hosts the payment provider's client checkout. Each provider gets an adapter
 * that turns `clientCheckout` into a signed callback payload; the server
 * verifies that payload (and the webhook) before the order is confirmed.
 */
export function PaymentGateway({ session, onResult }: { session: PaymentSession | null; onResult: (r: GatewayResult) => void }) {
  if (!session) return null;
  if (session.provider === "mock") return <MockGateway session={session} onResult={onResult} />;
  if (session.provider === "razorpay") return <RazorpayGateway session={session} onResult={onResult} />;
  return (
    <Sheet open onOpenChange={() => onResult({ status: "dismissed" })} title="Payment unavailable" side="center">
      <p>Online payment isn&apos;t configured yet. Please choose cash on delivery or try again later.</p>
    </Sheet>
  );
}

/** Development-only stand-in for a real gateway. The API refuses it in production. */
function MockGateway({ session, onResult }: { session: PaymentSession; onResult: (r: GatewayResult) => void }) {
  const [pending, setPending] = useState<"success" | "failure" | null>(null);
  const amount = Number(session.clientCheckout.amountPaise);

  async function pay(outcome: "success" | "failure") {
    setPending(outcome);
    try {
      const res = await api<{ outcome: string; callback?: Record<string, unknown>; error?: string }>("/dev/mock-gateway/pay", {
        method: "POST",
        body: { providerOrderId: session.clientCheckout.providerOrderId, outcome, amountPaise: amount },
      });
      onResult(res.callback ? { status: "success", payload: res.callback } : { status: "failed", message: res.error ?? "Payment failed." });
    } catch (error) {
      onResult({ status: "failed", message: errorMessage(error) });
    } finally {
      setPending(null);
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && !pending && onResult({ status: "dismissed" })} title="Test payment" side="center">
      <div className={styles.mock}>
        <p className={styles.badge}>Development gateway. No real money moves.</p>
        <div className={styles.amount}>
          <CreditCard size={22} aria-hidden="true" />
          <div>
            <p className={styles.label}>Amount to pay</p>
            <p className={styles.value}>{formatINR(amount)}</p>
          </div>
        </div>
        <p className={styles.ref}>Order {String(session.clientCheckout.orderNumber ?? "")}</p>
        <Button size="lg" fullWidth onClick={() => void pay("success")} loading={pending === "success"} disabled={pending !== null}>
          Pay {formatINR(amount)}
        </Button>
        <Button variant="ghost" fullWidth onClick={() => void pay("failure")} loading={pending === "failure"} disabled={pending !== null}>
          Simulate a declined payment
        </Button>
        <p className={styles.secure}>
          <ShieldCheck size={16} aria-hidden="true" /> Payment is verified on our servers before your order is confirmed.
        </p>
      </div>
    </Sheet>
  );
}

interface RazorpayInstance {
  open(): void;
  on(event: "payment.failed", handler: (response: { error?: { description?: string } }) => void): void;
}
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

const RAZORPAY_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = RAZORPAY_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Couldn't load the payment window. Check your connection and try again."));
    document.body.appendChild(script);
  });
}

/**
 * Razorpay Checkout. The handler's signed response goes to the server for
 * verification; nothing here decides that a payment succeeded.
 */
function RazorpayGateway({ session, onResult }: { session: PaymentSession; onResult: (r: GatewayResult) => void }) {
  const opened = useRef(false);
  const checkout = session.clientCheckout;

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    loadRazorpay()
      .then(() => {
        const rzp = new window.Razorpay!({
          key: checkout.key,
          order_id: checkout.providerOrderId,
          amount: checkout.amountPaise,
          currency: checkout.currency,
          name: "WovenWhale",
          description: `Order ${checkout.orderNumber}`,
          prefill: { name: checkout.prefillName, contact: checkout.prefillContact, email: checkout.prefillEmail },
          theme: { color: "#16324f" },
          handler: (response: Record<string, unknown>) => onResult({ status: "success", payload: response }),
          modal: { ondismiss: () => onResult({ status: "dismissed" }) },
        });
        rzp.on("payment.failed", (response) => onResult({ status: "failed", message: response.error?.description ?? "Payment failed." }));
        rzp.open();
      })
      .catch((error: Error) => onResult({ status: "failed", message: error.message }));
  }, [checkout, onResult]);

  return null;
}
