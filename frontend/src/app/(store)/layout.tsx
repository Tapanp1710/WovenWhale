import type { CategoryDTO, CustomerDTO, StoreConfigDTO } from "@wovenwhale/backend/contracts";
import type { ReactNode } from "react";
import { AdminPortalShortcut } from "@/components/store/layout/AdminPortalShortcut";
import { DemoBanner } from "@/components/store/layout/DemoBanner";
import { Footer } from "@/components/store/layout/Footer";
import { Header } from "@/components/store/layout/Header";
import { buildNavigation } from "@/components/store/layout/nav";
import { PageViewTracker } from "@/components/store/layout/PageViewTracker";
import { CartProvider } from "@/components/store/providers/CartProvider";
import { SessionProvider } from "@/components/store/providers/SessionProvider";
import { WishlistProvider } from "@/components/store/providers/WishlistProvider";
import { publicApi, sessionApi } from "@/lib/api/server";
import { formatINR } from "@/lib/format";
import styles from "./layout.module.css";

export default async function StoreLayout({ children }: { children: ReactNode }) {
  const [categories, config, session] = await Promise.all([
    publicApi<CategoryDTO[]>("/catalog/categories", 300).catch(() => []),
    publicApi<StoreConfigDTO>("/catalog/config", 300).catch(() => null),
    sessionApi<{ customer: CustomerDTO | null }>("/auth/me").catch(() => ({ customer: null })),
  ]);
  const nav = buildNavigation(categories);
  const announcement = config
    ? `Free delivery on orders over ${formatINR(config.freeShippingThresholdPaise)}. ${config.returnWindowDays}-day returns and exchanges.`
    : "Handwoven in India.";

  return (
    <SessionProvider initialCustomer={session.customer}>
      <CartProvider>
        <WishlistProvider>
          <a href="#main" className="skip-link">
            Skip to content
          </a>
          {config?.demo && <DemoBanner demo={config.demo} />}
          <Header nav={nav} announcement={announcement} />
          <main id="main" className={styles.main}>
            {children}
          </main>
          <Footer nav={nav} />
          <PageViewTracker />
          <AdminPortalShortcut sequence={process.env.ADMIN_PORTAL_TRIGGER ?? ""} />
        </WishlistProvider>
      </CartProvider>
    </SessionProvider>
  );
}
