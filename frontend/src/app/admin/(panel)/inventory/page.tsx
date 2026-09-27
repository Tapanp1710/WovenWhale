import type { InventoryRowDTO, Paginated } from "@wovenwhale/backend/contracts";
import { Boxes } from "lucide-react";
import type { Metadata } from "next";
import { InventoryTable } from "@/components/admin/inventory/InventoryTable";
import { adminWith, readParams, toQuery, type SearchParams } from "@/components/admin/server";
import { FilterForm } from "@/components/admin/ui/FilterForm";
import { NoAccess } from "@/components/admin/ui/NoAccess";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Pagination } from "@/components/admin/ui/Pagination";
import { Panel } from "@/components/admin/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { Checkbox, TextField } from "@/components/ui/Field";
import { sessionApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Inventory" };

export default async function InventoryPage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await adminWith("inventory.view"))) return <NoAccess what="inventory" />;
  const params = await readParams(searchParams, ["q", "lowStock", "page"]);
  const data = await sessionApi<Paginated<InventoryRowDTO>>(`/admin/inventory${toQuery({ ...params, pageSize: "50" })}`);

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Available = on hand minus units reserved by unconfirmed orders. Every adjustment is recorded in the size's history."
      />
      <Panel flush>
        <FilterForm key={JSON.stringify(params)} hasFilters={Boolean(params.q || params.lowStock)}>
          <TextField label="Search" name="q" type="search" placeholder="Product name or SKU" defaultValue={params.q} />
          <Checkbox label="Low stock only" name="lowStock" value="true" defaultChecked={params.lowStock === "true"} />
        </FilterForm>
        {data.items.length ? (
          <>
            <InventoryTable rows={data.items} />
            <Pagination basePath="/admin/inventory" params={params} page={data.page} totalPages={data.totalPages} total={data.total} />
          </>
        ) : (
          <EmptyState icon={<Boxes size={26} aria-hidden="true" />} title="Nothing to show">
            {params.lowStock ? "No sizes are below their threshold." : "No sizes match your search."}
          </EmptyState>
        )}
      </Panel>
    </>
  );
}
