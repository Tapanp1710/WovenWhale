import type { AbandonedCheckoutDTO, CheckoutStatus, Paginated } from "@wovenwhale/backend/contracts";
import { ShoppingBasket } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { RecoverySelect } from "@/components/admin/checkouts/RecoverySelect";
import { can, humanize } from "@/components/admin/labels";
import { adminWith, readParams, toQuery, type SearchParams } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/ui/NoAccess";
import { Notice } from "@/components/admin/ui/Notice";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Pagination } from "@/components/admin/ui/Pagination";
import { Panel } from "@/components/admin/ui/Panel";
import { QuickFilters } from "@/components/admin/ui/QuickFilters";
import { cell, Table } from "@/components/admin/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { sessionApi } from "@/lib/api/server";
import { formatDateTime, formatINR, formatPhone } from "@/lib/format";

export const metadata: Metadata = { title: "Abandoned checkouts" };

const TABS: [CheckoutStatus, string][] = [
  ["ABANDONED", "Abandoned"],
  ["ACTIVE", "In progress"],
  ["CONVERTED", "Converted"],
];

export default async function CheckoutsPage({ searchParams }: { searchParams: SearchParams }) {
  const admin = await adminWith("orders.view", "customers.view");
  if (!admin) return <NoAccess what="checkouts" />;
  const params = await readParams(searchParams, ["status", "page"]);
  const status = TABS.find(([s]) => s === params.status)?.[0] ?? "ABANDONED";
  const data = await sessionApi<Paginated<AbandonedCheckoutDTO>>(
    `/admin/checkouts${toQuery({ status, page: params.page, pageSize: "25" })}`,
  );

  return (
    <>
      <PageHeader
        title="Abandoned checkouts"
        description="Shoppers who started checkout but didn't place an order. Track who has been followed up."
      />
      <Notice title="Recovery messages are not sent automatically">
        WhatsApp recovery activates once the WhatsApp provider is configured and the abandoned-checkout template is approved. Until then,
        contact customers yourself and record the outcome here.
      </Notice>
      <Panel flush>
        <QuickFilters
          label="Checkout status"
          items={TABS.map(([s, label]) => ({
            href: s === "ABANDONED" ? "/admin/checkouts" : `/admin/checkouts?status=${s}`,
            label,
            active: s === status,
          }))}
        />
        {data.items.length ? (
          <>
            <Table label={`${humanize(status)} checkouts`} minWidth={940}>
              <thead>
                <tr>
                  <th scope="col">Customer</th>
                  <th scope="col">Bag</th>
                  <th scope="col" className={cell.num}>
                    Value
                  </th>
                  <th scope="col">Stopped at</th>
                  <th scope="col">Last activity</th>
                  <th scope="col">Recovery</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((k) => {
                  const name = k.customerName ?? "Unnamed customer";
                  return (
                    <tr key={k.id}>
                      <td>
                        {can(admin, "customers.view") ? (
                          <Link href={`/admin/customers/${k.customerId}`} className={cell.link}>
                            {name}
                          </Link>
                        ) : (
                          name
                        )}
                        <span className={cell.sub}>
                          <a href={`tel:${k.customerPhone}`}>{formatPhone(k.customerPhone)}</a>
                        </span>
                      </td>
                      <td>
                        {k.items.map((i, n) => (
                          <span key={n} className={cell.sub}>
                            {i.name} ({i.size}) × {i.quantity}
                          </span>
                        ))}
                      </td>
                      <td className={`${cell.num} ${cell.strong}`}>{formatINR(k.totalPaise)}</td>
                      <td>{humanize(k.step)}</td>
                      <td className={cell.nowrap}>
                        {formatDateTime(k.lastActivityAt)}
                        {k.convertedOrderNumber && <span className={cell.sub}>Order {k.convertedOrderNumber}</span>}
                      </td>
                      <td>
                        <RecoverySelect id={k.id} value={k.recoveryStatus} label={`Recovery status for ${name}`} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <Pagination
              basePath="/admin/checkouts"
              params={status === "ABANDONED" ? {} : { status }}
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
            />
          </>
        ) : (
          <EmptyState icon={<ShoppingBasket size={26} aria-hidden="true" />} title="Nothing here">
            No {humanize(status).toLowerCase()} checkouts right now.
          </EmptyState>
        )}
      </Panel>
    </>
  );
}
