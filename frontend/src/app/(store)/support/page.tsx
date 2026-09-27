import type { Metadata } from "next";
import Link from "next/link";
import { ContactDetails } from "@/components/store/content/ContactDetails";
import { ContentPage } from "@/components/store/content/ContentPage";
import { SupportForm } from "@/components/store/content/SupportForm";
import { formatINR } from "@/lib/format";
import { storeConfig } from "@/lib/store-config";

export const metadata: Metadata = {
  title: "Help and support",
  description: "Answers about orders, delivery, cash on delivery, returns and sizing, and a way to reach the WovenWhale team.",
  alternates: { canonical: "/support" },
};

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const { order } = await searchParams;
  const c = await storeConfig();
  const faqs = [
    {
      q: "Where is my order?",
      a: (
        <>
          Open it in <Link href="/account/orders">your orders</Link> or use <Link href="/track-order">order tracking</Link>. Courier and AWB
          details appear as soon as it ships.
        </>
      ),
    },
    {
      q: "Can I cancel my order?",
      a: `Yes, within ${c.cancellationWindowHours} hours of placing it and before it's packed, from the order page. Paid orders are refunded to the original payment method.`,
    },
    {
      q: "How does cash on delivery work?",
      a: c.codEnabled
        ? `Choose cash on delivery at checkout and pay the courier when your order arrives. Our team confirms each COD order before it ships; you'll see the update on your order page.${
            c.codFeePaise > 0 ? ` A ${formatINR(c.codFeePaise)} COD fee applies.` : ""
          }`
        : "Cash on delivery is paused right now. Please pay online at checkout.",
    },
    {
      q: "How much is delivery?",
      a: `Delivery is free on orders over ${formatINR(c.freeShippingThresholdPaise)}. Below that, a flat ${formatINR(c.flatShippingPaise)} applies.`,
    },
    {
      q: "How do returns and exchanges work?",
      a: (
        <>
          You can request a return, an exchange for another size, or a refund within {c.returnWindowDays} days of delivery.{" "}
          <Link href="/returns">See how returns work</Link>.
        </>
      ),
    },
    {
      q: "How do I find my size?",
      a: "Every product page has a size guide with body measurements. If you're between sizes, size up for a relaxed fit, or ask us for the garment measurements of a style.",
    },
  ];

  return (
    <ContentPage
      title="Help and support"
      lede="Quick answers to common questions, and a direct line to our team."
      aside={<ContactDetails />}
    >
      <h2>Common questions</h2>
      {faqs.map((f) => (
        <details key={f.q}>
          <summary>
            <strong>{f.q}</strong>
          </summary>
          <p>{f.a}</p>
        </details>
      ))}
      <h2>Send us a message</h2>
      <SupportForm orderNumber={order} />
    </ContentPage>
  );
}
