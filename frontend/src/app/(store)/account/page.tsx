import type { CustomerDTO, OrderSummaryDTO, Paginated } from "@wovenwhale/backend/contracts";
import Link from "next/link";
import { OrderList } from "@/components/store/account/OrderList";
import { ProfileForm } from "@/components/store/account/ProfileForm";
import { accountApi } from "@/lib/api/server";
import styles from "./page.module.css";

export const metadata = { title: "Overview" };

export default async function AccountPage() {
  const [me, orders] = await Promise.all([
    accountApi<{ customer: CustomerDTO }>("/auth/me"),
    accountApi<Paginated<OrderSummaryDTO>>("/orders?pageSize=3"),
  ]);
  if (!me?.customer || !orders) return null;
  const { customer } = me;
  return (
    <div className={styles.page}>
      <section aria-labelledby="recent-orders">
        <div className={styles.head}>
          <h2 id="recent-orders" className={styles.title}>
            Recent orders
          </h2>
          {orders.total > 3 && (
            <Link href="/account/orders" className={styles.link}>
              All orders
            </Link>
          )}
        </div>
        {orders.items.length ? (
          <OrderList orders={orders.items} />
        ) : (
          <p className={styles.muted}>
            No orders yet. <Link href="/shop">Browse the collection</Link> to find your first handwoven piece.
          </p>
        )}
      </section>
      <section aria-labelledby="profile">
        <h2 id="profile" className={styles.title}>
          Profile
        </h2>
        <ProfileForm customer={customer} />
      </section>
    </div>
  );
}
