import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/store/content/ContentPage";
import { formatINR } from "@/lib/format";
import { storeConfig } from "@/lib/store-config";

export const metadata: Metadata = { title: "Shipping policy", alternates: { canonical: "/shipping-policy" } };

export default async function ShippingPolicyPage() {
  const c = await storeConfig();
  const cod = c.codEnabled
    ? `Available on orders up to ${formatINR(c.codMaxOrderPaise)}${c.codFeePaise > 0 ? `, with a ${formatINR(c.codFeePaise)} fee` : ""}. Please keep the exact amount ready for the courier.`
    : "Cash on delivery is currently paused.";
  return (
    <ContentPage title="Shipping policy" lede="How and when your order reaches you." updated="September 2026">
      <h2>Delivery charges</h2>
      <p>
        Delivery is free on orders of {formatINR(c.freeShippingThresholdPaise)} or more. Below that, a flat charge of{" "}
        {formatINR(c.flatShippingPaise)} applies. The exact amount is always shown before you pay.
      </p>
      <h2>Dispatch</h2>
      <p>
        We start preparing your order once it&apos;s confirmed. Online payments confirm instantly; cash on delivery orders are confirmed by
        our team first. When your order ships, the courier name and AWB number appear on your order page.
      </p>
      <h2>Cash on delivery</h2>
      <p>{cod}</p>
      <h2>Tracking</h2>
      <p>
        Follow your order from <Link href="/account/orders">your account</Link> or with <Link href="/track-order">order tracking</Link>.
      </p>
    </ContentPage>
  );
}
