import type { Metadata } from "next";
import { ContactDetails } from "@/components/store/content/ContactDetails";
import { ContentPage } from "@/components/store/content/ContentPage";
import { SupportForm } from "@/components/store/content/SupportForm";

export const metadata: Metadata = {
  title: "Contact us",
  description: "Get in touch with the WovenWhale team about orders, sizing, returns or wholesale.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <ContentPage
      title="Contact us"
      lede="Questions about an order, a weave or a size? Write to us and we'll get back to you."
      aside={<ContactDetails />}
    >
      <SupportForm />
    </ContentPage>
  );
}
