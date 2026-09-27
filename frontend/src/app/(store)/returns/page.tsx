import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/store/content/ContentPage";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { storeConfig } from "@/lib/store-config";

export const metadata: Metadata = {
  title: "Returns and exchanges",
  description: "How to return or exchange a WovenWhale order.",
  alternates: { canonical: "/returns" },
};

export default async function ReturnsPage() {
  const { returnWindowDays } = await storeConfig();
  return (
    <ContentPage
      title="Returns and exchanges"
      lede={`Changed your mind or need a different size? You have ${returnWindowDays} days from delivery to ask for a return, exchange or refund.`}
      aside={
        <ButtonLink href="/account/orders" fullWidth>
          Start from your orders
        </ButtonLink>
      }
    >
      <h2>How it works</h2>
      <ol>
        <li>
          Open the delivered order in <Link href="/account/orders">your account</Link> and choose “Return or exchange items”.
        </li>
        <li>Pick the items, the quantity and whether you want a return, an exchange for another size, or a refund.</li>
        <li>Our team reviews the request. We may ask for a photo or a few details; you can reply right on the order page.</li>
        <li>Once approved, we arrange the pickup. For exchanges, the new size ships once we receive the original.</li>
        <li>Refunds go back to your original payment method. For cash on delivery orders we refund by bank transfer or UPI.</li>
      </ol>
      <h2>What can be returned</h2>
      <p>
        Items should be unworn, unwashed and have their tags attached. Handloom fabric naturally has slight irregularities in weave and
        colour; these are part of the craft rather than defects.
      </p>
      <p>
        Read the full <Link href="/return-policy">return policy</Link> for details on refunds and timelines.
      </p>
    </ContentPage>
  );
}
