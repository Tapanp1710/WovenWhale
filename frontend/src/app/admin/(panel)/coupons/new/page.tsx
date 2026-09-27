import type { Metadata } from "next";
import { CouponForm } from "@/components/admin/coupons/CouponForm";
import { loadScopeOptions } from "@/components/admin/coupons/scope";
import { adminWith } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/ui/NoAccess";
import { PageHeader } from "@/components/admin/ui/PageHeader";

export const metadata: Metadata = { title: "New coupon" };

export default async function NewCouponPage() {
  if (!(await adminWith("coupons.manage"))) return <NoAccess what="coupon editing" />;
  const { categories, products } = await loadScopeOptions();
  return (
    <>
      <PageHeader back={{ href: "/admin/coupons", label: "Coupons" }} title="New coupon" />
      <CouponForm coupon={null} categories={categories} products={products} />
    </>
  );
}
