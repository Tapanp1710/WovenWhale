"use client";

import { codRejectSchema } from "@wovenwhale/backend/contracts";
import { Check, Clock } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api/client";
import { formatDateTime } from "@/lib/format";
import { useAction, useCan } from "../AdminContext";
import { ReasonDialog } from "../ui/ReasonDialog";
import styles from "./CodActions.module.css";

type Busy = "approve" | "reject" | "remind" | null;

/**
 * Approve / Reject / Remind later for one COD order awaiting approval, using
 * the existing API (which enforces orders.approve_cod and the state machine).
 * All three are disabled while any one runs, so a double click can't send a
 * second request; on success the server data is refreshed and the row leaves
 * the approval list.
 */
export function CodActions({
  order,
}: {
  order: { id: string; orderNumber: string; status: string; codReviewRemindedUntil: string | null };
}) {
  const canDecide = useCan("orders.approve_cod");
  const { run } = useAction();
  const [busy, setBusy] = useState<Busy>(null);
  const [rejecting, setRejecting] = useState(false);
  if (!canDecide || order.status !== "PENDING_COD_APPROVAL") return null;
  const snoozedUntil =
    order.codReviewRemindedUntil && new Date(order.codReviewRemindedUntil) > new Date() ? order.codReviewRemindedUntil : null;

  async function act(kind: Exclude<Busy, null>, fn: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(kind);
    await run(fn, success);
    setBusy(null);
  }

  return (
    <div className={styles.actions} onClick={(e) => e.stopPropagation()} data-cod-actions={order.orderNumber}>
      <Button
        size="sm"
        disabled={busy !== null}
        icon={busy === "approve" ? undefined : <Check size={15} aria-hidden="true" />}
        aria-label={`Approve COD order ${order.orderNumber}`}
        onClick={() =>
          act(
            "approve",
            () => api(`/admin/orders/${order.id}/approve-cod`, { method: "POST", body: {} }),
            `Order ${order.orderNumber} approved`,
          )
        }
      >
        {busy === "approve" ? "Approving…" : "Approve"}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={busy !== null}
        aria-label={`Reject COD order ${order.orderNumber}`}
        onClick={() => setRejecting(true)}
      >
        {busy === "reject" ? "Rejecting…" : "Reject"}
      </Button>
      {snoozedUntil ? (
        <span className={styles.snoozed}>
          <Clock size={14} aria-hidden="true" /> Reminder {formatDateTime(snoozedUntil)}
        </span>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          disabled={busy !== null}
          aria-label={`Remind me later about COD order ${order.orderNumber}`}
          onClick={() =>
            act(
              "remind",
              () => api(`/admin/orders/${order.id}/remind-cod`, { method: "POST", body: { hours: 24 } }),
              `Reminder set: ${order.orderNumber} comes back in 24 hours`,
            )
          }
        >
          {busy === "remind" ? "Saving…" : "Remind later"}
        </Button>
      )}
      <ReasonDialog
        open={rejecting}
        onOpenChange={setRejecting}
        title="Reject this COD order?"
        description="Rejecting this order will not create a payment refund because this is a COD order. Reserved stock is released and the customer is told why."
        name="reason"
        label="Reason for the customer"
        schema={codRejectSchema}
        confirmLabel="Reject order"
        cancelLabel="Cancel"
        danger
        onConfirm={async (values) => {
          if (busy) return false;
          setBusy("reject");
          const ok = await run(
            () => api(`/admin/orders/${order.id}/reject-cod`, { method: "POST", body: values }),
            `Order ${order.orderNumber} rejected`,
          );
          setBusy(null);
          return ok;
        }}
      />
    </div>
  );
}
