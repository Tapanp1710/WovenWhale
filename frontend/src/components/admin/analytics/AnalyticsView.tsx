import type { AnalyticsDTO } from "@wovenwhale/backend/contracts";
import Link from "next/link";
import { formatINR } from "@/lib/format";
import { BarList } from "../charts/BarList";
import { ChartCard } from "../charts/ChartCard";
import { formatDay } from "../charts/format";
import { TrendChart } from "../charts/TrendChart";
import { KpiStrip } from "../dashboard/KpiStrip";
import { count, percent } from "../labels";
import { Panel } from "../ui/Panel";
import { cell, Table } from "../ui/Table";
import styles from "./AnalyticsView.module.css";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function AnalyticsView({ data }: { data: AnalyticsDTO }) {
  const s = data.series;
  const busiest = s.reduce((b, p) => (p.visitors > (b?.visitors ?? -1) ? p : b), s[0]);
  const categories = data.categoryPerformance.map((c) => ({ label: c.category, value: c.revenuePaise }));
  const searches = data.topSearches.map((q) => ({ label: q.query, value: q.count }));

  return (
    <div className={styles.view}>
      <KpiStrip
        label="Store performance"
        columns={6}
        items={[
          { label: "Visitors", value: count(data.visitors) },
          { label: "Product views", value: count(data.productViews) },
          { label: "Add-to-bag rate", value: percent(data.addToCartRate) },
          { label: "Checkout rate", value: percent(data.checkoutRate) },
          { label: "Payment success", value: percent(data.paymentSuccessRate) },
          { label: "Conversion rate", value: percent(data.conversionRate, 2) },
          { label: "Revenue", value: formatINR(data.revenuePaise) },
          { label: "Average order value", value: formatINR(data.averageOrderValuePaise) },
          { label: "Returning customers", value: count(data.returningCustomers), sub: `${percent(data.returningCustomerRate)} of buyers` },
          { label: "Abandoned checkouts", value: percent(data.abandonedCheckoutRate), sub: "of checkouts started" },
          { label: "Cart recovery", value: percent(data.cartRecoveryRate), sub: "of abandoned checkouts" },
        ]}
      />

      <div className={styles.charts}>
        <ChartCard
          className={styles.wide}
          title="Visitors over time"
          summary={`${count(sum(s.map((p) => p.visitors)))} visits${busiest ? `; busiest day ${formatDay(busiest.date)} with ${count(busiest.visitors)}` : ""}.`}
          rows={s.map((p) => [p.date, String(p.visitors)])}
          columns={["Date", "Visitors"]}
        >
          <TrendChart data={s.map((p) => ({ date: p.date, value: p.visitors }))} format="count" name="Visitors" height={220} />
        </ChartCard>
        <ChartCard
          title="Revenue over time"
          summary={`${formatINR(sum(s.map((p) => p.revenuePaise)))} in total.`}
          rows={s.map((p) => [p.date, formatINR(p.revenuePaise)])}
          columns={["Date", "Revenue"]}
        >
          <TrendChart data={s.map((p) => ({ date: p.date, value: p.revenuePaise }))} format="inr" name="Revenue" color="ink" />
        </ChartCard>
        <ChartCard
          title="Orders over time"
          summary={`${count(sum(s.map((p) => p.orders)))} orders.`}
          rows={s.map((p) => [p.date, String(p.orders)])}
          columns={["Date", "Orders"]}
        >
          <TrendChart data={s.map((p) => ({ date: p.date, value: p.orders }))} format="count" name="Orders" color="good" />
        </ChartCard>
        <ChartCard
          title="Category performance"
          summary={categories[0] ? `${categories[0].label} brought in the most revenue.` : "No sales in this range."}
          rows={data.categoryPerformance.map((c) => [c.category, `${formatINR(c.revenuePaise)}, ${c.units} units, ${c.orders} orders`])}
          columns={["Category", "Revenue, units, orders"]}
        >
          <BarList data={categories} format="inr" name="Revenue" />
        </ChartCard>
        <ChartCard
          title="Top searches"
          summary={searches[0] ? `"${searches[0].label}" was searched most often.` : "No searches recorded."}
          rows={searches.map((q) => [q.label, String(q.value)])}
          columns={["Search", "Times"]}
        >
          <BarList data={searches} format="count" name="Searches" color="muted" labelWidth={140} />
        </ChartCard>
      </div>

      <Panel flush title="Top products" description="Views, bag adds and sales for the selected range.">
        <Table label="Top products" minWidth={680}>
          <thead>
            <tr>
              <th scope="col">Product</th>
              <th scope="col" className={cell.num}>
                Views
              </th>
              <th scope="col" className={cell.num}>
                Added to bag
              </th>
              <th scope="col" className={cell.num}>
                View to bag
              </th>
              <th scope="col" className={cell.num}>
                Units sold
              </th>
              <th scope="col" className={cell.num}>
                Revenue
              </th>
            </tr>
          </thead>
          <tbody>
            {data.topProducts.map((p) => (
              <tr key={p.productId}>
                <td>
                  <Link href={`/admin/products/${p.productId}`} className={cell.link}>
                    {p.name}
                  </Link>
                </td>
                <td className={cell.num}>{count(p.views)}</td>
                <td className={cell.num}>{count(p.addToCarts)}</td>
                <td className={`${cell.num} ${cell.muted}`}>{p.views ? percent(p.addToCarts / p.views) : "—"}</td>
                <td className={cell.num}>{count(p.units)}</td>
                <td className={`${cell.num} ${cell.strong}`}>{formatINR(p.revenuePaise)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>
    </div>
  );
}
