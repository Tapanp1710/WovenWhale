# Order, payment and return state machines

Order status (fulfilment) and payment status (money) are separate columns with separate state machines. The rules are pure functions in [`backend/src/domain/`](../backend/src/domain) with unit tests, and the only code that changes an order's status is `transitionOrder()` in [`modules/orders/lifecycle.ts`](../backend/src/modules/orders/lifecycle.ts).

## Order status

```
Prepaid:  PENDING_PAYMENT ──(payment verified, system)──► CONFIRMED
COD:      PENDING_COD_APPROVAL ──(admin approves)──────► CONFIRMED
          PENDING_COD_APPROVAL ──(admin rejects)───────► REJECTED

CONFIRMED ► PROCESSING ► PACKED ► SHIPPED ► OUT_FOR_DELIVERY ► DELIVERED
                                        └──────────────────────► DELIVERED   (carrier may skip OFD)

Cancellation: PENDING_PAYMENT | PENDING_COD_APPROVAL | CONFIRMED | PROCESSING | PACKED ► CANCELLED
```

### Who may do what

| Transition | Customer | Admin | System |
| --- | --- | --- | --- |
| `PENDING_PAYMENT → CONFIRMED` | No | No | Only when `payment_status = PAYMENT_SUCCESS` (verified server-side) |
| `PENDING_COD_APPROVAL → CONFIRMED / REJECTED` | No | Needs `orders.approve_cod` | No |
| `→ CANCELLED` | Status is `PENDING_*`, `CONFIRMED` or `PROCESSING` **and** now ≤ `cancel_deadline_at` | Needs `orders.cancel_override` (any time before shipping) | Only unpaid `PENDING_PAYMENT` (payment timeout) |
| Fulfilment steps | No | Needs `orders.manage`; `SHIPPED` needs a shipment with courier and AWB | Carrier webhooks (`OUT_FOR_DELIVERY`, `DELIVERED`) |

### Side effects applied by `transitionOrder`

| Entering | Effect |
| --- | --- |
| `CONFIRMED` | Stock reservation becomes a deduction (`ORDER_CONFIRMED` movement); `confirmed_at` set |
| `CANCELLED` / `REJECTED` | Stock released (if still reserved) or put back (if already deducted); coupon redemptions returned; if money was collected, a refund is created and sent by the refund worker; otherwise the pending payment is closed as failed |
| `SHIPPED` | Shipment marked in transit |
| `DELIVERED` | `delivered_at` set; `return_deadline_at = delivered_at + 14 days`; COD payment marked collected |
| every transition | `order_status_history` row; customer notification queued; admin actions also write `audit_logs` |

## Business rules and where they're enforced

| Rule | Enforcement |
| --- | --- |
| 1. Prepaid orders need no approval after verified payment | `handleVerifiedPaymentEvent` transitions to `CONFIRMED` as `SYSTEM` |
| 2. COD stays `PENDING_COD_APPROVAL` until an authorised admin approves | `initialStatuses("COD")`; only the `orders.approve_cod` guard can leave that state |
| 3. COD rejection results in `REJECTED` | Same guard; stock and coupons released |
| 4. Order and payment status are separate | Two columns, two machines (`ORDER_TRANSITIONS`, `PAYMENT_TRANSITIONS`) |
| 5. Customer cancellation within 12 hours | `cancel_deadline_at` computed at placement from `ORDER_CANCELLATION_WINDOW_HOURS`; checked on the server |
| 6. Returns within 14 days of delivery | `return_deadline_at` computed at delivery from `RETURN_WINDOW_DAYS`; checked on the server |
| 7. Business calculations server-side | `priceCart()` is the only pricing path; client totals are only compared (`PRICE_CHANGED`) |
| 8. Transactional inventory | Row locks + check constraints + journal |
| 9. Coupons validated server-side | `validateCoupon()` at quote and again under lock at placement |
| 10. Payment verified server-side | Signed client callback and signed webhook, both verified before any status change |
| 12. Auditable admin actions | `recordAudit()` in the same transaction |

## Payment status

```
PAYMENT_INITIATED ─► PAYMENT_PENDING ─► PAYMENT_SUCCESS ─► PAYMENT_PARTIALLY_REFUNDED ─► PAYMENT_REFUNDED
        │                 │                   └─────────────────────────────────────────► PAYMENT_REFUNDED
        └────────────────►└─► PAYMENT_FAILED ─► (retry) PAYMENT_PENDING  or  (late capture) PAYMENT_SUCCESS
```

COD orders start at `PAYMENT_PENDING` and move to `PAYMENT_SUCCESS` when delivered (cash collected).

### Edge cases handled

| Case | Handling |
| --- | --- |
| Duplicate webhook | `payment_events (provider, provider_event_id)` unique; second delivery is a no-op |
| Callback and webhook both arrive | Whichever is first captures; the other finds the payment already successful |
| Failed payment | Payment marked failed; order stays `PENDING_PAYMENT` so the customer can retry until `payment_expires_at` |
| Payment timeout | Job cancels the order and releases stock |
| Late capture after timeout/cancellation | Payment recorded, automatically refunded; order stays cancelled |
| Duplicate capture on a paid order | Second payment flagged `is_duplicate` and automatically refunded |
| Captured amount differs from expected | Order is **not** confirmed; payment flagged for review |
| Refund | Refund rows (`PENDING → PROCESSING → PROCESSED/FAILED`); order moves to partially refunded or refunded when processed |

## Returns, exchanges and refunds

```
REQUESTED ──► APPROVED ──► RECEIVED ──► REFUND_INITIATED ──► COMPLETED     (RETURN)
    │             │            └──────────────────────────► COMPLETED     (EXCHANGE: replacement dispatched)
    │             └──► REFUND_INITIATED ──► COMPLETED                      (REFUND: no pickup)
    ├──► INFO_REQUESTED ──► REQUESTED (customer replies) | APPROVED | REJECTED
    ├──► REJECTED
    └──► CANCELLED (customer withdraws)
```

- Customers can only withdraw or reply to an information request; everything else is an admin action (`returns.manage`; refunds need `refunds.approve`).
- `RECEIVED` optionally restocks the items (`RETURN_RECEIVED` movement).
- Refund amount is computed per unit from what was actually paid for that line (price minus its share of any coupon), with the last unit absorbing rounding so a full return refunds the line exactly. Total refunds can never exceed the amount paid.
- COD orders are refunded by bank transfer or UPI; an admin records the transfer reference to mark it processed.
