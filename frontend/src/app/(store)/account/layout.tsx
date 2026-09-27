import type { CustomerDTO } from "@wovenwhale/backend/contracts";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AccountNav } from "@/components/store/account/AccountNav";
import { SignInPanel } from "@/components/store/account/SignInPanel";
import { sessionApi } from "@/lib/api/server";
import styles from "./layout.module.css";

export const metadata: Metadata = {
  title: { default: "Your account", template: "%s | Your account | WovenWhale" },
  robots: { index: false, follow: false },
};

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const { customer } = await sessionApi<{ customer: CustomerDTO | null }>("/auth/me").catch(() => ({ customer: null }));
  if (!customer) return <SignInPanel reason="See your orders, track deliveries, manage returns and keep a wishlist." />;
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.greeting}>{customer.fullName ? `Hello, ${customer.fullName.split(" ")[0]}` : "Your account"}</h1>
      </header>
      <div className={styles.layout}>
        <AccountNav />
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
