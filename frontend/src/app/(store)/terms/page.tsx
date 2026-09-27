import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/store/content/ContentPage";
import { storeConfig } from "@/lib/store-config";

export const metadata: Metadata = { title: "Terms of use", alternates: { canonical: "/terms" } };

export default async function TermsPage() {
  const c = await storeConfig();
  return (
    <ContentPage title="Terms of use" lede="The terms that apply when you shop with WovenWhale." updated="September 2026">
      <h2>Orders and pricing</h2>
      <p>
        Prices are in Indian rupees and include GST. The price you pay is the one confirmed at checkout. An order is accepted once it is
        confirmed: for online payments, when your payment is verified; for cash on delivery, when our team approves the order. We may
        decline or cancel an order, for example if an item becomes unavailable, and will refund any amount paid.
      </p>
      <h2>Cancellations</h2>
      <p>
        You can cancel an order within {c.cancellationWindowHours} hours of placing it, as long as it hasn&apos;t been packed, from your
        order page.
      </p>
      <h2>Returns</h2>
      <p>
        Returns, exchanges and refunds are available within {c.returnWindowDays} days of delivery under our{" "}
        <Link href="/return-policy">return policy</Link>.
      </p>
      <h2>Handmade products</h2>
      <p>
        Our products are handwoven. Slight variations in weave, colour and pattern between pieces and from product photos are natural and
        are not defects.
      </p>
      <h2>Your account</h2>
      <p>
        You sign in with a one-time code sent to your mobile number. Keep access to your phone secure and don&apos;t share codes with
        anyone.
      </p>
      <h2>Contact</h2>
      <p>
        Questions about these terms? <Link href="/contact">Contact us</Link>.
      </p>
    </ContentPage>
  );
}
