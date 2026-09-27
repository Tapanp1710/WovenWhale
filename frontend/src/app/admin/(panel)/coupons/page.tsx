import type { AdminCouponDTO } from "@wovenwhale/backend/contracts";
import { Plus, Tags } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { couponState, couponValue, type CouponState } from "@/components/admin/coupons/couponText";
import { can, type Tone } from "@/components/admin/labels";
import { adminWith } from "@/components/admin/server";
import { Badge } from "@/components/admin/ui/Badge";
import { NoAccess } from "@/components/admin/ui/NoAccess";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Panel } from "@/components/admin/ui/Panel";
import { cell, Table } from "@/components/admin/ui/Table";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { sessionApi } from "@/lib/api/server";
import { formatDate, formatINR } from "@/lib/format";

export const metadata: Metadata = { title: "Coupons" };

const STATE: Record<CouponState, [string, Tone]> = {
  active: ["Active", "success"],
  scheduled: ["Scheduled", "info"],
  expired: ["Expired", "neutral"],
  "used-up": ["Limit reached", "warning"],
  off: ["Off", "neutral"],
};

export default async function CouponsPage() {
  const admin = await adminWith("coupons.view", "coupons.manage");
  if (!admin) return <NoAccess what="coupons" />;
  const coupons = await sessionApi<AdminCouponDTO[]>("/admin/coupons");

  return (
    <>
      <PageHeader
        title="Coupons"
        description="Codes customers enter at checkout. Usage and discount totals count placed orders."
        actions={
          can(admin, "coupons.manage") && (
            <ButtonLink href="/admin/coupons/new" size="sm" icon={<Plus size={16} aria-hidden="true" />}>
              Create coupon
            </ButtonLink>
          )
        }
      />
      <Panel flush>
        {coupons.length ? (
          <Table label="Coupons" minWidth={860}>
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Discount</th>
                <th scope="col">Conditions</th>
                <th scope="col">Valid</th>
                <th scope="col" className={cell.num}>
                  Used
                </th>
                <th scope="col" className={cell.num}>
                  Discount given
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => {
                const [label, tone] = STATE[couponState(c)];
                const conditions = [
                  c.minOrderPaise ? `Min ${formatINR(c.minOrderPaise)}` : null,
                  c.firstOrderOnly ? "First order" : null,
                  c.newCustomersOnly ? "New customers" : null,
                  c.isStackable ? "Stackable" : null,
                  c.productIds.length || c.categoryIds.length ? "Limited items" : null,
                ].filter(Boolean);
                return (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/admin/coupons/${c.id}`} className={cell.link}>
                        {c.code}
                      </Link>
                      {c.description && <span className={cell.sub}>{c.description}</span>}
                    </td>
                    <td className={cell.nowrap}>{couponValue(c)}</td>
                    <td className={cell.muted}>{conditions.join(" · ") || "None"}</td>
                    <td className={cell.nowrap}>
                      {c.startsAt ? formatDate(c.startsAt) : "Any time"}
                      <span className={cell.sub}>{c.endsAt ? `until ${formatDate(c.endsAt)}` : "No end date"}</span>
                    </td>
                    <td className={cell.num}>
                      {c.usedCount}
                      {c.usageLimit !== null && <span className={cell.sub}>of {c.usageLimit}</span>}
                    </td>
                    <td className={`${cell.num} ${cell.strong}`}>{formatINR(c.totalDiscountPaise)}</td>
                    <td>
                      <Badge tone={tone}>{label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={<Tags size={26} aria-hidden="true" />} title="No coupons yet">
            Create a code for a campaign or a first-order offer.
          </EmptyState>
        )}
      </Panel>
    </>
  );
}
