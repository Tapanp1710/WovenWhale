import type { OrderStatus, PaymentStatus, ProductStatus, RefundStatus, ReturnStatus, StockState } from "@wovenwhale/backend/contracts";
import { RETURN_STATUS_LABELS } from "@wovenwhale/backend/contracts";
import {
  humanize,
  ORDER_STATUS_ADMIN_LABELS,
  ORDER_STATUS_TONE,
  PAYMENT_STATUS_ADMIN_LABELS,
  PAYMENT_STATUS_TONE,
  REFUND_STATUS_TONE,
  RETURN_STATUS_TONE,
} from "../labels";
import { Badge } from "./Badge";

export const OrderStatusBadge = ({ status }: { status: OrderStatus }) => (
  <Badge tone={ORDER_STATUS_TONE[status]}>{ORDER_STATUS_ADMIN_LABELS[status]}</Badge>
);

export const PaymentStatusBadge = ({ status }: { status: PaymentStatus }) => (
  <Badge tone={PAYMENT_STATUS_TONE[status]}>{PAYMENT_STATUS_ADMIN_LABELS[status]}</Badge>
);

export const ReturnStatusBadge = ({ status }: { status: ReturnStatus }) => (
  <Badge tone={RETURN_STATUS_TONE[status]}>{RETURN_STATUS_LABELS[status]}</Badge>
);

export const RefundStatusBadge = ({ status }: { status: RefundStatus }) => (
  <Badge tone={REFUND_STATUS_TONE[status]}>{humanize(status)}</Badge>
);

const PRODUCT_STATUS: Record<ProductStatus, { label: string; tone: "success" | "neutral" | "warning" }> = {
  ACTIVE: { label: "Active", tone: "success" },
  DRAFT: { label: "Draft", tone: "neutral" },
  ARCHIVED: { label: "Archived", tone: "warning" },
};

export const ProductStatusBadge = ({ status }: { status: ProductStatus }) => (
  <Badge tone={PRODUCT_STATUS[status].tone}>{PRODUCT_STATUS[status].label}</Badge>
);

export const STOCK_STATE_LABELS: Record<StockState, string> = {
  IN_STOCK: "In stock",
  LOW_STOCK: "Low stock",
  OUT_OF_STOCK: "Out of stock",
};

/** Text plus colour, so the state never relies on colour alone. */
export const StockStateBadge = ({ state }: { state: StockState }) => (
  <Badge tone={state === "OUT_OF_STOCK" ? "danger" : state === "LOW_STOCK" ? "warning" : "success"}>{STOCK_STATE_LABELS[state]}</Badge>
);
