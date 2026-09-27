import type { AuditLogDTO, Paginated } from "@wovenwhale/backend/contracts";
import { ScrollText } from "lucide-react";
import type { Metadata } from "next";
import { AUDIT_ENTITY_TYPES, AuditTable } from "@/components/admin/audit/AuditTable";
import { humanize } from "@/components/admin/labels";
import { adminWith, readParams, toQuery, type SearchParams } from "@/components/admin/server";
import { FilterForm } from "@/components/admin/ui/FilterForm";
import { NoAccess } from "@/components/admin/ui/NoAccess";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Pagination } from "@/components/admin/ui/Pagination";
import { Panel } from "@/components/admin/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { SelectField, TextField } from "@/components/ui/Field";
import { sessionApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditLogPage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await adminWith("audit.view"))) return <NoAccess what="the audit log" />;
  const params = await readParams(searchParams, ["entityType", "entityId", "action", "page"]);
  const data = await sessionApi<Paginated<AuditLogDTO>>(`/admin/audit-logs${toQuery({ ...params, pageSize: "50" })}`);

  return (
    <>
      <PageHeader title="Audit log" description="Every admin change, newest first. Open a row to compare before and after." />
      <Panel flush>
        <FilterForm key={JSON.stringify(params)} hasFilters={Object.keys(params).some((k) => k !== "page")}>
          <SelectField label="Record type" name="entityType" defaultValue={params.entityType ?? ""}>
            <option value="">Any type</option>
            {AUDIT_ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {humanize(t)}
              </option>
            ))}
          </SelectField>
          <TextField label="Action starts with" name="action" placeholder="order." defaultValue={params.action} />
          <TextField label="Record ID" name="entityId" defaultValue={params.entityId} />
        </FilterForm>
        {data.items.length ? (
          <>
            <AuditTable rows={data.items} />
            <Pagination basePath="/admin/audit-logs" params={params} page={data.page} totalPages={data.totalPages} total={data.total} />
          </>
        ) : (
          <EmptyState icon={<ScrollText size={26} aria-hidden="true" />} title="No entries">
            Nothing matches these filters.
          </EmptyState>
        )}
      </Panel>
    </>
  );
}
