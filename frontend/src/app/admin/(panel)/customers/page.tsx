import type { AdminCustomerRowDTO, Paginated } from "@wovenwhale/backend/contracts";
import { Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { adminWith, readParams, toQuery, type SearchParams } from "@/components/admin/server";
import { Badge } from "@/components/admin/ui/Badge";
import { FilterForm } from "@/components/admin/ui/FilterForm";
import { NoAccess } from "@/components/admin/ui/NoAccess";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Pagination } from "@/components/admin/ui/Pagination";
import { Panel } from "@/components/admin/ui/Panel";
import { cell, Table } from "@/components/admin/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { TextField } from "@/components/ui/Field";
import { sessionApi } from "@/lib/api/server";
import { formatDate, formatINR, formatPhone } from "@/lib/format";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await adminWith("customers.view"))) return <NoAccess what="customers" />;
  const params = await readParams(searchParams, ["q", "page"]);
  const data = await sessionApi<Paginated<AdminCustomerRowDTO>>(`/admin/customers${toQuery({ ...params, pageSize: "25" })}`);

  return (
    <>
      <PageHeader title="Customers" description="Most recent buyers first. Open a customer for their full history." />
      <Panel flush>
        <FilterForm key={params.q ?? ""} hasFilters={Boolean(params.q)}>
          <TextField label="Search" name="q" type="search" placeholder="Name, phone or email" defaultValue={params.q} />
        </FilterForm>
        {data.items.length ? (
          <>
            <Table label="Customers" minWidth={820}>
              <thead>
                <tr>
                  <th scope="col">Customer</th>
                  <th scope="col">Email</th>
                  <th scope="col" className={cell.num}>
                    Orders
                  </th>
                  <th scope="col" className={cell.num}>
                    Total spent
                  </th>
                  <th scope="col">Last order</th>
                  <th scope="col">Joined</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/admin/customers/${c.id}`} className={cell.link}>
                        {c.fullName ?? "Unnamed customer"}
                      </Link>{" "}
                      {c.isBlocked && <Badge tone="danger">Blocked</Badge>}
                      <span className={cell.sub}>{formatPhone(c.phone)}</span>
                    </td>
                    <td className={cell.muted}>{c.email ?? "—"}</td>
                    <td className={cell.num}>{c.orderCount}</td>
                    <td className={`${cell.num} ${cell.strong}`}>{formatINR(c.totalSpentPaise)}</td>
                    <td className={cell.nowrap}>{c.lastOrderAt ? formatDate(c.lastOrderAt) : "—"}</td>
                    <td className={`${cell.nowrap} ${cell.muted}`}>{formatDate(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination basePath="/admin/customers" params={params} page={data.page} totalPages={data.totalPages} total={data.total} />
          </>
        ) : (
          <EmptyState icon={<Users size={26} aria-hidden="true" />} title={params.q ? "No customers match" : "No customers yet"}>
            {params.q ? "Try a phone number without the country code." : "Customers appear here after they sign in."}
          </EmptyState>
        )}
      </Panel>
    </>
  );
}
