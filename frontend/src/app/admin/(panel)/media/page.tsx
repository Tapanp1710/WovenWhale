import type { MediaAssetDTO, Paginated } from "@wovenwhale/backend/contracts";
import type { Metadata } from "next";
import { MediaLibrary } from "@/components/admin/media/MediaLibrary";
import { adminWith, readParams, toQuery, type SearchParams } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/ui/NoAccess";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Pagination } from "@/components/admin/ui/Pagination";
import { sessionApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Media library" };

export default async function MediaPage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await adminWith("content.manage"))) return <NoAccess what="the media library" />;
  const params = await readParams(searchParams, ["q", "page"]);
  const data = await sessionApi<Paginated<MediaAssetDTO>>(`/admin/media${toQuery({ ...params, pageSize: "30" })}`);
  return (
    <>
      <PageHeader title="Media library" description="Images for the website. Upload once, then use them in any section from the website editor." />
      <MediaLibrary items={data.items} q={params.q ?? ""} />
      <Pagination basePath="/admin/media" params={params} page={data.page} totalPages={data.totalPages} total={data.total} />
    </>
  );
}
