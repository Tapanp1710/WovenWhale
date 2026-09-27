import type { OrderStatus, PaymentStatus, RefundStatus, ReturnStatus } from "@wovenwhale/backend/contracts";
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
