import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/store/content/ContentPage";
import { storeConfig } from "@/lib/store-config";

export const metadata: Metadata = { title: "Return policy", alternates: { canonical: "/return-policy" } };

export default async function ReturnPolicyPage() {
  const c = await storeConfig();
  return (
    <ContentPage
      title="Return policy"
      lede={`Returns, exchanges and refunds within ${c.returnWindowDays} days of delivery.`}
      updated="September 2026"
    >
      <h2>Eligibility</h2>
      <ul>
        <li>Request within {c.returnWindowDays} days of the delivery date shown on your order.</li>
        <li>Items must be unworn, unwashed and have their original tags.</li>
        <li>Natural variations in handloom weave and colour are not defects.</li>
      </ul>
      <h2>Options</h2>
      <ul>
        <li>
          <strong>Return:</strong> send the item back and get a refund once we receive it.
        </li>
        <li>
          <strong>Exchange:</strong> swap for a different size of the same piece, subject to availability.
        </li>
        <li>
          <strong>Refund:</strong> for items that arrived damaged or incorrect, where a pickup isn&apos;t needed.
        </li>
      </ul>
      <h2>Refunds</h2>
      <p>
        We refund what you paid for the returned items, including any coupon discount applied to them. Delivery charges are refunded only
        when a whole order is cancelled. Online payments are refunded to the original method; cash on delivery orders are refunded by bank
        transfer or UPI.
      </p>
      <h2>How to start</h2>
      <p>
        Open the delivered order in <Link href="/account/orders">your account</Link> and choose “Return or exchange items”. See{" "}
        <Link href="/returns">how returns work</Link>.
      </p>
    </ContentPage>
  );
}
