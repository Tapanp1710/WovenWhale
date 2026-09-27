"use client";

import {
  adminCancelSchema,
  codDecisionSchema,
  codRejectSchema,
  orderStatusUpdateSchema,
  type AdminOrderDetailDTO,
  type OrderStatus,
} from "@wovenwhale/backend/contracts";
import { Truck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api/client";
import { useAction, useCan } from "../AdminContext";
import { ORDER_STATUS_ADMIN_LABELS } from "../labels";
import { ReasonDialog } from "../ui/ReasonDialog";
import styles from "./OrderActions.module.css";
import { ShipDialog } from "./ShipDialog";

/** Status moves an admin can make directly; SHIPPED goes through the shipment form. */
const STEP_STATUSES = orderStatusUpdateSchema.shape.to.options.filter((s) => s !== "SHIPPED");
type Step = (typeof STEP_STATUSES)[number];
const isStep = (s: OrderStatus): s is Step => (STEP_STATUSES as readonly OrderStatus[]).includes(s);
const noteOnly = orderStatusUpdateSchema.pick({ note: true });

type Dialog = { kind: "approve" } | { kind: "reject" } | { kind: "cancel" } | { kind: "step"; to: Step } | { kind: "ship" } | null;

/** Action bar driven entirely by the API's `allowedTransitions` and the admin's permissions. */
export function OrderActions({ order }: { order: AdminOrderDetailDTO }) {
  const canManage = useCan("orders.manage");
  const canCod = useCan("orders.approve_cod");
  const canCancel = useCan("orders.cancel_override");
  const { run } = useAction();
  const [dialog, setDialog] = useState<Dialog>(null);
  const allowed = order.allowedTransitions;
  const base = `/admin/orders/${order.id}`;
  const close = (open: boolean) => !open && setDialog(null);

  const codPending = order.status === "PENDING_COD_APPROVAL" && canCod;
  const steps = canManage ? allowed.filter(isStep) : [];
  const canShip = canManage && order.status === "PACKED" && allowed.includes("SHIPPED");
  const cancellable = canCancel && allowed.includes("CANCELLED");

  if (!codPending && !steps.length && !canShip && !cancellable) return null;

  return (
    <div className={styles.bar} role="group" aria-label="Order actions">
      {codPending && allowed.includes("CONFIRMED") && <Button onClick={() => setDialog({ kind: "approve" })}>Approve COD order</Button>}
      {codPending && allowed.includes("REJECTED") && (
        <Button variant="secondary" onClick={() => setDialog({ kind: "reject" })}>
          Reject COD order
        </Button>
      )}
      {steps.map((to) => (
        <Button key={to} onClick={() => setDialog({ kind: "step", to })}>
          Mark as {ORDER_STATUS_ADMIN_LABELS[to].toLowerCase()}
        </Button>
      ))}
      {canShip && (
        <Button onClick={() => setDialog({ kind: "ship" })} icon={<Truck size={16} aria-hidden="true" />}>
          Ship order
        </Button>
      )}
      {cancellable && (
        <Button variant="ghost" className={styles.cancel} onClick={() => setDialog({ kind: "cancel" })}>
          Cancel order
        </Button>
      )}

      <ReasonDialog
        open={dialog?.kind === "approve"}
        onOpenChange={close}
        title={`Approve order ${order.orderNumber}`}
        description="Confirms the order for packing and tells the customer."
        name="note"
        label="Note"
        optional
        schema={codDecisionSchema}
        confirmLabel="Approve order"
        onConfirm={(v) => run(() => api(`${base}/approve-cod`, { method: "POST", body: v }), "Order approved")}
      />
      <ReasonDialog
        open={dialog?.kind === "reject"}
        onOpenChange={close}
        title={`Reject order ${order.orderNumber}`}
        description="The customer is told the order couldn't be accepted and reserved stock is released."
        name="reason"
        label="Reason"
        schema={codRejectSchema}
        confirmLabel="Reject order"
        danger
        onConfirm={(v) => run(() => api(`${base}/reject-cod`, { method: "POST", body: v }), "Order rejected")}
      />
      <ReasonDialog
        open={dialog?.kind === "cancel"}
        onOpenChange={close}
        title={`Cancel order ${order.orderNumber}`}
        description="Stock is released and, for paid orders, a refund is created. This can't be undone."
        name="reason"
        label="Reason"
        schema={adminCancelSchema}
        confirmLabel="Cancel order"
        danger
        onConfirm={(v) => run(() => api(`${base}/cancel`, { method: "POST", body: v }), "Order cancelled")}
      />
      {dialog?.kind === "step" && (
        <ReasonDialog
          open
          onOpenChange={close}
          title={`Mark as ${ORDER_STATUS_ADMIN_LABELS[dialog.to].toLowerCase()}`}
          description="The customer sees the new status on their order page."
          name="note"
          label="Note"
          optional
          multiline={false}
          schema={noteOnly}
          confirmLabel="Update status"
          onConfirm={(v) => run(() => api(`${base}/status`, { method: "POST", body: { ...v, to: dialog.to } }), "Status updated")}
        />
      )}
      <ShipDialog open={dialog?.kind === "ship"} onOpenChange={close} orderId={order.id} />
    </div>
  );
}
