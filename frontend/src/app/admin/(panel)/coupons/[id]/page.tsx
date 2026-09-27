import type { AdminCouponDTO } from "@wovenwhale/backend/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CouponForm } from "@/components/admin/coupons/CouponForm";
import { couponValue } from "@/components/admin/coupons/couponText";
import { loadScopeOptions } from "@/components/admin/coupons/scope";
import { adminWith } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/ui/NoAccess";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { sessionApiOrNull } from "@/lib/api/server";

export const metadata: Metadata = { title: "Coupon" };

export default async function CouponPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await adminWith("coupons.view", "coupons.manage"))) return <NoAccess what="coupons" />;
  const { id } = await params;
  const [coupon, scope] = await Promise.all([
    sessionApiOrNull<AdminCouponDTO>(`/admin/coupons/${encodeURIComponent(id)}`),
    loadScopeOptions(),
  ]);
  if (!coupon) notFound();
  return (
    <>
      <PageHeader back={{ href: "/admin/coupons", label: "Coupons" }} title={coupon.code} description={couponValue(coupon)} />
      <CouponForm key={coupon.id} coupon={coupon} categories={scope.categories} products={scope.products} />
    </>
  );
}
