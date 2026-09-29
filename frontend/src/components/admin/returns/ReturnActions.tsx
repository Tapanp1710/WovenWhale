"use client";

import { returnTransitionSchema, type AdminReturnRowDTO } from "@wovenwhale/backend/contracts";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api/client";
import { useAction, useCan } from "../AdminContext";
import { ReasonDialog } from "../ui/ReasonDialog";
import { ReceiveDialog } from "./ReceiveDialog";
import { RefundDialog } from "./RefundDialog";
import styles from "./ReturnActions.module.css";

const noteSchema = returnTransitionSchema.pick({ note: true });
const infoSchema = returnTransitionSchema.pick({ infoRequest: true }).required();

type Open = "approve" | "reject" | "info" | "receive" | "complete" | "refund" | null;

/** Buttons follow the return's `allowedTransitions` and the admin's permissions. */
export function ReturnActions({ ret, inline = false }: { ret: AdminReturnRowDTO; inline?: boolean }) {
  const canManage = useCan("returns.manage");
  const canRefund = useCan("refunds.approve");
  const { run } = useAction();
  const [open, setOpen] = useState<Open>(null);
  // In a table row only the decision buttons show, small; the rest live on the return page.
  const size = inline ? "sm" : "md";
  const has = (s: AdminReturnRowDTO["allowedTransitions"][number]) =>
    ret.allowedTransitions.includes(s) && (!inline || s === "APPROVED" || s === "REJECTED");
  const close = (o: boolean) => !o && setOpen(null);
  const transition = (to: string, success: string) => (v: Record<string, string | undefined>) =>
    run(() => api(`/admin/returns/${ret.id}/transition`, { method: "POST", body: { ...v, to } }), success);

  const buttons = [
    canManage && has("APPROVED") && (
      <Button key="a" size={size} onClick={() => setOpen("approve")}>
        Approve
      </Button>
    ),
    canManage && has("RECEIVED") && (
      <Button key="r" onClick={() => setOpen("receive")}>
        Mark as received
      </Button>
    ),
    canRefund && has("REFUND_INITIATED") && ret.refundablePaise > 0 && (
      <Button key="f" onClick={() => setOpen("refund")}>
        Approve refund
      </Button>
    ),
    canManage && has("COMPLETED") && (
      <Button key="c" variant="secondary" onClick={() => setOpen("complete")}>
        Mark as completed
      </Button>
    ),
    canManage && has("INFO_REQUESTED") && (
      <Button key="i" variant="secondary" onClick={() => setOpen("info")}>
        Ask for information
      </Button>
    ),
    canManage && has("REJECTED") && (
      <Button key="x" size={size} variant="ghost" className={styles.reject} onClick={() => setOpen("reject")}>
        Decline
      </Button>
    ),
  ].filter(Boolean);
  if (!buttons.length) return null;

  return (
    <div className={inline ? styles.inline : styles.bar} role="group" aria-label={`Actions for return ${ret.returnNumber}`}>
      {buttons}
      <ReasonDialog
        open={open === "approve"}
        onOpenChange={close}
        title="Approve this request"
        description="The customer is told the request was approved and what happens next."
        name="note"
        label="Note to the team"
        optional
        schema={noteSchema}
        confirmLabel="Approve"
        onConfirm={transition("APPROVED", "Return approved")}
      />
      <ReasonDialog
        open={open === "reject"}
        onOpenChange={close}
        title="Decline this request"
        description="The customer sees the request was declined."
        name="note"
        label="Reason"
        optional
        schema={noteSchema}
        confirmLabel="Decline request"
        danger
        onConfirm={transition("REJECTED", "Return declined")}
      />
      <ReasonDialog
        open={open === "info"}
        onOpenChange={close}
        title="Ask the customer for information"
        description="Shown to the customer on their return page."
        name="infoRequest"
        label="What do you need?"
        schema={infoSchema}
        confirmLabel="Send request"
        onConfirm={transition("INFO_REQUESTED", "Information requested")}
      />
      <ReasonDialog
        open={open === "complete"}
        onOpenChange={close}
        title="Mark as completed"
        description="Closes the return. Do this after any refund or exchange has gone out."
        name="note"
        label="Note"
        optional
        schema={noteSchema}
        confirmLabel="Complete return"
        onConfirm={transition("COMPLETED", "Return completed")}
      />
      {open === "receive" && <ReceiveDialog returnId={ret.id} onClose={() => setOpen(null)} />}
      {open === "refund" && <RefundDialog ret={ret} onClose={() => setOpen(null)} />}
    </div>
  );
}
