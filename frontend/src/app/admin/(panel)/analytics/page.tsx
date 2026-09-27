import type { AnalyticsDTO } from "@wovenwhale/backend/contracts";
import type { Metadata } from "next";
import { AnalyticsView } from "@/components/admin/analytics/AnalyticsView";
import { parseRange, RangePicker, rangeQuery } from "@/components/admin/dashboard/RangePicker";
import { adminWith, readParams, type SearchParams } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/ui/NoAccess";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { sessionApi } from "@/lib/api/server";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await adminWith("analytics.view"))) return <NoAccess what="analytics" />;
  const range = parseRange((await readParams(searchParams, ["range"])).range);
  const data = await sessionApi<AnalyticsDTO>(`/admin/analytics?${rangeQuery(range)}`);
  return (
    <>
      <PageHeader
        title="Analytics"
        description={`${formatDate(data.range.from)} to ${formatDate(data.range.to)}. Visitors are counted from storefront page views.`}
        actions={<RangePicker basePath="/admin/analytics" current={range} />}
      />
      <AnalyticsView data={data} />
    </>
  );
}
