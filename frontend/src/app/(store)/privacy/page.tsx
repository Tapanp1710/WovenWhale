import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/store/content/ContentPage";

export const metadata: Metadata = { title: "Privacy policy", alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  return (
    <ContentPage title="Privacy policy" lede="What we collect, why, and the choices you have." updated="September 2026">
      <h2>What we collect</h2>
      <ul>
        <li>Your mobile number, which you use to sign in with a one-time code.</li>
        <li>Your name, email (optional) and delivery addresses, to fulfil and support your orders.</li>
        <li>
          Orders, returns and payments you make with us. Card and UPI details are handled by our payment partner; we never see or store
          them.
        </li>
        <li>
          How the store is used, such as pages and products viewed and items added to a bag, linked to an anonymous browser identifier. We
          don&apos;t record your IP address or device fingerprint for analytics.
        </li>
      </ul>
      <h2>How we use it</h2>
      <ul>
        <li>To process, deliver and support your orders, returns and refunds.</li>
        <li>To prevent fraud, for example when reviewing cash on delivery orders.</li>
        <li>To understand what customers look for, so we can improve the store and collection.</li>
        <li>To send order updates. Marketing messages are sent only if you opt in, and you can opt out at any time from your account.</li>
      </ul>
      <h2>Cookies</h2>
      <p>
        We use a small number of first-party cookies: to keep you signed in, to remember your bag, and an anonymous visitor identifier for
        store analytics. We don&apos;t use third-party advertising cookies.
      </p>
      <h2>Sharing</h2>
      <p>
        We share only what&apos;s needed with the partners who help us run the store: our payment gateway, courier partners (name, phone and
        address for delivery) and messaging providers for order updates. We don&apos;t sell your data.
      </p>
      <h2>Your choices</h2>
      <p>
        You can update your details and preferences in <Link href="/account">your account</Link>, or <Link href="/contact">contact us</Link>{" "}
        to access, correct or delete your data. Some order records must be kept to meet tax and accounting requirements.
      </p>
    </ContentPage>
  );
}
