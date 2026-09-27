import type { AdminOrderDetailDTO } from "@wovenwhale/backend/contracts";
import { formatINR } from "@/lib/format";
import { cell, Table } from "../ui/Table";
import styles from "./OrderItems.module.css";

/** Line items with the price breakdown the customer was charged. */
export function OrderItems({ order }: { order: AdminOrderDetailDTO }) {
  const totals: [string, number, boolean?][] = [
    ["Subtotal", order.subtotalPaise],
    ["Discount", -order.discountPaise],
    ["Shipping", order.shippingPaise],
    ["COD fee", order.codFeePaise],
  ];
  return (
    <>
      <Table label="Items" minWidth={620}>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">SKU</th>
            <th scope="col" className={cell.num}>
              Qty
            </th>
            <th scope="col" className={cell.num}>
              Unit price
            </th>
            <th scope="col" className={cell.num}>
              Discount
            </th>
            <th scope="col" className={cell.num}>
              Line total
            </th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id}>
              <td>
                <div className={styles.product}>
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt="" className={cell.thumb} loading="lazy" />
                  ) : (
                    <span className={cell.thumb} />
                  )}
                  <span>
                    <span className={cell.strong}>{item.productName}</span>
                    <span className={cell.sub}>Size {item.size}</span>
                  </span>
                </div>
              </td>
              <td className={cell.muted}>{item.sku}</td>
              <td className={cell.num}>{item.quantity}</td>
              <td className={cell.num}>
                {formatINR(item.unitPricePaise)}
                {item.unitMrpPaise > item.unitPricePaise && <s className={cell.sub}>{formatINR(item.unitMrpPaise)}</s>}
              </td>
              <td className={cell.num}>{item.discountPaise ? `−${formatINR(item.discountPaise)}` : "—"}</td>
              <td className={`${cell.num} ${cell.strong}`}>{formatINR(item.lineTotalPaise)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
      <div className={styles.footer}>
        <div className={styles.coupons}>
          {order.couponCodes.length ? (
            <>
              <span className={styles.label}>Coupons</span>
              {order.couponCodes.map((c) => (
                <code key={c} className={styles.code}>
                  {c}
                </code>
              ))}
            </>
          ) : (
            <span className={styles.label}>No coupons used</span>
          )}
        </div>
        <dl className={styles.totals}>
          {totals
            .filter(([label, v]) => v !== 0 || label === "Shipping")
            .map(([label, v]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{v < 0 ? `−${formatINR(-v)}` : v === 0 ? "Free" : formatINR(v)}</dd>
              </div>
            ))}
          <div className={styles.grand}>
            <dt>Total</dt>
            <dd>{formatINR(order.totalPaise)}</dd>
          </div>
        </dl>
      </div>
    </>
  );
}
