import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/store/content/ContentPage";
import { TrackOrderForm } from "@/components/store/content/TrackOrderForm";

export const metadata: Metadata = {
  title: "Track your order",
  description: "Check the status of your WovenWhale order with your order number and mobile number.",
  alternates: { canonical: "/track-order" },
};

export default function TrackOrderPage() {
  return (
    <ContentPage
      title="Track your order"
      lede={
        <>
          Enter the order number from your confirmation and the mobile number you used at checkout. Signed in?{" "}
          <Link href="/account/orders">See all your orders</Link>.
        </>
      }
    >
      <TrackOrderForm />
    </ContentPage>
  );
}
