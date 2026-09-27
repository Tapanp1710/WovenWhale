import type { StoreConfigDTO } from "@wovenwhale/backend/contracts";
import type { Metadata } from "next";
import { CheckoutFlow } from "@/components/store/checkout/CheckoutFlow";
import { publicApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };

export default async function CheckoutPage() {
  const config = await publicApi<StoreConfigDTO>("/catalog/config", 300).catch(() => null);
  return <CheckoutFlow cancellationWindowHours={config?.cancellationWindowHours ?? 12} />;
}
