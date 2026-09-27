import type { DashboardDTO } from "@wovenwhale/backend/contracts";
import { formatINR } from "@/lib/format";
import { BarList } from "../charts/BarList";
import { ChartCard } from "../charts/ChartCard";
import { formatDay } from "../charts/format";
import { TrendChart } from "../charts/TrendChart";
import { count, humanize, ORDER_STATUS_ADMIN_LABELS, PAYMENT_STATUS_ADMIN_LABELS, percent } from "../labels";
import styles from "./DashboardCharts.module.css";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function DashboardCharts({ data }: { data: DashboardDTO }) {
  const s = data.series;
  const peak = s.reduce((best, p) => (p.revenuePaise > (best?.revenuePaise ?? -1) ? p : best), s[0]);
  const status = data.orderStatusDistribution.map((d) => ({ label: ORDER_STATUS_ADMIN_LABELS[d.status], value: d.count }));
  const payment = data.paymentStatusDistribution.map((d) => ({ label: PAYMENT_STATUS_ADMIN_LABELS[d.status], value: d.count }));
  const categories = data.salesByCategory.map((c) => ({ label: c.category, value: c.revenuePaise }));
  const products = data.topProducts.map((p) => ({ label: p.name, value: p.revenuePaise }));
  const acquisition = data.acquisition.map((a) => ({ label: humanize(a.source), value: a.customers }));
  const funnel = data.funnel.map((f) => ({ label: f.stage, value: f.count }));
  const first = funnel[0]?.value ?? 0;
  const last = funnel.at(-1)?.value ?? 0;
  const rows = (xs: { label: string; value: number }[], fmt: (v: number) => string) =>
    xs.map((x): [string, string] => [x.label, fmt(x.value)]);
  const daily = (key: "revenuePaise" | "orders" | "customers") => s.map((p) => ({ date: p.date, value: p[key] }));

  return (
    <div className={styles.grid}>
      <ChartCard
        className={styles.wide}
        title="Revenue over time"
        summary={`${formatINR(sum(s.map((p) => p.revenuePaise)))} across ${s.length} days${peak && peak.revenuePaise ? `; best day ${formatDay(peak.date)} at ${formatINR(peak.revenuePaise)}` : ""}.`}
        rows={s.map((p) => [p.date, formatINR(p.revenuePaise)])}
        columns={["Date", "Revenue"]}
      >
        <TrendChart data={daily("revenuePaise")} format="inr" name="Revenue" height={240} />
      </ChartCard>
      <ChartCard
        title="Orders over time"
        summary={`${count(sum(s.map((p) => p.orders)))} orders placed.`}
        rows={s.map((p) => [p.date, String(p.orders)])}
        columns={["Date", "Orders"]}
      >
        <TrendChart data={daily("orders")} format="count" name="Orders" color="ink" />
      </ChartCard>
      <ChartCard
        title="New customers over time"
        summary={`${count(sum(s.map((p) => p.customers)))} customers signed up.`}
        rows={s.map((p) => [p.date, String(p.customers)])}
        columns={["Date", "New customers"]}
      >
        <TrendChart data={daily("customers")} format="count" name="New customers" color="good" />
      </ChartCard>
      <ChartCard
        title="Sales by category"
        summary={categories[0] ? `${categories[0].label} leads with ${formatINR(categories[0].value)}.` : "No sales in this range."}
        rows={rows(categories, formatINR)}
      >
        <BarList data={categories} format="inr" name="Revenue" />
      </ChartCard>
      <ChartCard
        title="Top products"
        summary={products[0] ? `${products[0].label} earned the most, ${formatINR(products[0].value)}.` : "No sales in this range."}
        rows={rows(products, formatINR)}
      >
        <BarList data={products} format="inr" name="Revenue" color="ink" labelWidth={170} />
      </ChartCard>
      <ChartCard
        title="Order status"
        summary={`${count(sum(status.map((x) => x.value)))} orders by current status.`}
        rows={rows(status, String)}
      >
        <BarList data={status} format="count" name="Orders" />
      </ChartCard>
      <ChartCard
        title="Payment status"
        summary={`${count(sum(payment.map((x) => x.value)))} orders by payment state.`}
        rows={rows(payment, String)}
      >
        <BarList data={payment} format="count" name="Orders" color="muted" />
      </ChartCard>
      <ChartCard
        title="Customer acquisition"
        summary={acquisition[0] ? `Most new customers came from ${acquisition[0].label.toLowerCase()}.` : "No new customers in this range."}
        rows={rows(acquisition, String)}
      >
        <BarList data={acquisition} format="count" name="Customers" color="good" />
      </ChartCard>
      <ChartCard
        title="Checkout funnel"
        summary={first ? `${percent(last / first)} of visitors placed an order.` : "No visits recorded in this range."}
        rows={rows(funnel, (v) => `${count(v)}${first ? ` (${percent(v / first)})` : ""}`)}
        columns={["Stage", "People"]}
      >
        <BarList data={funnel} format="count" name="People" color="ink" labelWidth={130} />
      </ChartCard>
    </div>
  );
}
