import type { DashboardDTO } from "@wovenwhale/backend/contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { CodQueue } from "@/components/admin/dashboard/CodQueue";
import { DashboardCharts } from "@/components/admin/dashboard/DashboardCharts";
import { KpiStrip } from "@/components/admin/dashboard/KpiStrip";
import { LowStockTable } from "@/components/admin/dashboard/LowStockTable";
import { parseRange, RangePicker, rangeQuery } from "@/components/admin/dashboard/RangePicker";
import { can, count, percent } from "@/components/admin/labels";
import { adminWith, readParams, type SearchParams } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/ui/NoAccess";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Panel } from "@/components/admin/ui/Panel";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { sessionApi } from "@/lib/api/server";
import { formatDate, formatDateTime, formatINR } from "@/lib/format";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const admin = await adminWith("dashboard.view");
  if (!admin) return <NoAccess what="the dashboard" />;
  const range = parseRange((await readParams(searchParams, ["range"])).range);
  const data = await sessionApi<DashboardDTO>(`/admin/dashboard?${rangeQuery(range)}`);
  const k = data.kpis;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Dashboard"
        description={`${formatDate(data.range.from)} to ${formatDate(data.range.to)}`}
        actions={<RangePicker basePath="/admin" current={range} />}
      />

      {can(admin, "orders.view") && (
        <Panel
          id="cod"
          tone={data.codPending.length ? "attention" : undefined}
          flush
          title={`COD pending approval (${k.codPendingApproval})`}
          description="Call the customer to confirm, then approve or reject. Oldest orders first."
          actions={
            k.codPendingApproval > data.codPending.length ? (
              <ButtonLink href="/admin/cod" size="sm" variant="secondary">
                See all {k.codPendingApproval}
              </ButtonLink>
            ) : undefined
          }
        >
          <CodQueue rows={data.codPending} />
        </Panel>
      )}

      <KpiStrip
        label="Key numbers for the selected range"
        items={[
          { label: "Revenue", value: formatINR(k.revenuePaise), href: "/admin/analytics" },
          { label: "Orders", value: count(k.orders), href: "/admin/orders" },
          { label: "Customers", value: count(k.customers), sub: `${count(k.newCustomers)} new`, href: "/admin/customers" },
          { label: "Average order value", value: formatINR(k.averageOrderValuePaise) },
          { label: "Conversion rate", value: percent(k.conversionRate, 2) },
          { label: "Abandoned checkouts", value: count(k.abandonedCheckouts), href: "/admin/checkouts" },
          {
            label: "COD pending approval",
            value: count(k.codPendingApproval),
            href: "/admin/cod",
            attention: k.codPendingApproval > 0,
          },
          { label: "Refunds", value: formatINR(k.refundsPaise), sub: `${count(k.refundCount)} refunds` },
          { label: "Open returns", value: count(k.openReturns), href: "/admin/returns" },
          { label: "Low-stock variants", value: count(k.lowStockVariants), href: "/admin/inventory?lowStock=true" },
        ]}
      />

      {can(admin, "products.view") && (
        <KpiStrip
          label="Catalogue and stock"
          columns={4}
          items={[
            { label: "Products", value: count(data.inventory.totalProducts), sub: "active and drafts", href: "/admin/products" },
            { label: "Active products", value: count(data.inventory.activeProducts), href: "/admin/products?status=ACTIVE" },
            {
              label: "Low stock",
              value: count(data.inventory.lowStockProducts),
              sub: "a size is low or sold out",
              href: "/admin/products?stock=LOW_STOCK",
              attention: data.inventory.lowStockProducts > 0,
            },
            {
              label: "Out of stock",
              value: count(data.inventory.outOfStockProducts),
              href: "/admin/products?stock=OUT_OF_STOCK",
              attention: data.inventory.outOfStockProducts > 0,
            },
          ]}
        />
      )}

      <DashboardCharts data={data} />

      <Panel
        flush
        title="Low stock"
        description="Variants at or below their reorder threshold."
        actions={
          <ButtonLink href="/admin/inventory?lowStock=true" size="sm" variant="ghost">
            Open inventory
          </ButtonLink>
        }
      >
        {data.lowStock.length ? (
          <LowStockTable rows={data.lowStock} />
        ) : (
          <p className={styles.empty}>Every variant is above its threshold.</p>
        )}
      </Panel>

      {can(admin, "inventory.view") && (
        <Panel title="Recent restocks" description="The latest units received, from the stock ledger.">
          {data.inventory.recentRestocks.length ? (
            <ul className={styles.restocks}>
              {data.inventory.recentRestocks.map((r, i) => (
                <li key={i}>
                  <Link href={`/admin/products/${r.productId}`}>{r.productName}</Link> <span className={styles.muted}>size {r.size}</span>
                  <strong className={styles.plus}>+{r.quantity}</strong>
                  <span className={styles.muted}>
                    {r.actor ?? "System"} · {formatDateTime(r.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>No restocks recorded yet.</p>
          )}
        </Panel>
      )}
    </div>
  );
}
