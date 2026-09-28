import {
  RETURN_STATUS_LABELS,
  RETURN_STATUSES,
  RETURN_TYPE_LABELS,
  RETURN_TYPES,
  type AdminReturnRowDTO,
  type Paginated,
} from "@wovenwhale/backend/contracts";
import { Undo2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { humanize } from "@/components/admin/labels";
import { ReturnActions } from "@/components/admin/returns/ReturnActions";
import { adminWith, readParams, toQuery, type SearchParams } from "@/components/admin/server";
import { FilterForm } from "@/components/admin/ui/FilterForm";
import { NoAccess } from "@/components/admin/ui/NoAccess";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Pagination } from "@/components/admin/ui/Pagination";
import { Panel } from "@/components/admin/ui/Panel";
import { QuickFilters } from "@/components/admin/ui/QuickFilters";
import { ReturnStatusBadge } from "@/components/admin/ui/StatusBadges";
import { cell, Table } from "@/components/admin/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { SelectField } from "@/components/ui/Field";
import { sessionApi } from "@/lib/api/server";
import { formatDate, formatINR, formatPhone } from "@/lib/format";

export const metadata: Metadata = { title: "Returns" };

export default async function ReturnsPage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await adminWith("returns.view"))) return <NoAccess what="returns" />;
  const params = await readParams(searchParams, ["status", "type", "page"]);
  const data = await sessionApi<Paginated<AdminReturnRowDTO>>(`/admin/returns${toQuery({ ...params, pageSize: "25" })}`);
  // New requests can be approved or declined right here; later steps stay on the detail page.
  const showActions = data.items.some((r) => r.status === "REQUESTED");

  return (
    <>
      <PageHeader title="Returns" description="Return, exchange and refund requests. New requests need a decision." />
      <Panel flush>
        <QuickFilters
          label="Quick filters"
          items={[
            { href: "/admin/returns", label: "All requests", active: !params.status && !params.type },
            { href: "/admin/returns?status=REQUESTED", label: "Needs a decision", active: params.status === "REQUESTED", attention: true },
            { href: "/admin/returns?status=APPROVED", label: "Awaiting pickup", active: params.status === "APPROVED" },
            { href: "/admin/returns?status=RECEIVED", label: "Received", active: params.status === "RECEIVED" },
          ]}
        />
        <FilterForm key={JSON.stringify(params)} hasFilters={Boolean(params.status || params.type)}>
          <SelectField label="Status" name="status" defaultValue={params.status ?? ""}>
            <option value="">Any status</option>
            {RETURN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {RETURN_STATUS_LABELS[s]}
              </option>
            ))}
          </SelectField>
          <SelectField label="Type" name="type" defaultValue={params.type ?? ""}>
            <option value="">Any type</option>
            {RETURN_TYPES.map((t) => (
              <option key={t} value={t}>
                {RETURN_TYPE_LABELS[t]}
              </option>
            ))}
          </SelectField>
        </FilterForm>
        {data.items.length ? (
          <>
            <Table label="Returns" minWidth={showActions ? 1300 : 900}>
              <thead>
                <tr>
                  <th scope="col">Return</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Type</th>
                  <th scope="col">Items</th>
                  <th scope="col" className={cell.num}>
                    Refundable
                  </th>
                  <th scope="col">Requested</th>
                  <th scope="col">Status</th>
                  {showActions && <th scope="col">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/admin/returns/${r.id}`} className={cell.link}>
                        {r.returnNumber}
                      </Link>
                      <span className={cell.sub}>Order {r.orderNumber}</span>
                    </td>
                    <td>
                      {r.customerName ?? "Unnamed customer"}
                      <span className={cell.sub}>{formatPhone(r.customerPhone)}</span>
                    </td>
                    <td>
                      {RETURN_TYPE_LABELS[r.type]}
                      <span className={cell.sub}>{humanize(r.reason)}</span>
                    </td>
                    <td>
                      {r.items.map((i) => (
                        <span key={i.orderItemId} className={cell.sub}>
                          {i.productName} ({i.size}) × {i.quantity}
                        </span>
                      ))}
                    </td>
                    <td className={cell.num}>{formatINR(r.refundablePaise)}</td>
                    <td className={cell.nowrap}>{formatDate(r.createdAt)}</td>
                    <td>
                      <ReturnStatusBadge status={r.status} />
                    </td>
                    {showActions && <td>{r.status === "REQUESTED" && <ReturnActions ret={r} inline />}</td>}
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination basePath="/admin/returns" params={params} page={data.page} totalPages={data.totalPages} total={data.total} />
          </>
        ) : (
          <EmptyState icon={<Undo2 size={26} aria-hidden="true" />} title="No returns here">
            {params.status || params.type ? "Nothing matches these filters." : "Return requests from customers will appear here."}
          </EmptyState>
        )}
      </Panel>
    </>
  );
}
