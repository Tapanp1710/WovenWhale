import type { StoreConfigDTO } from "@wovenwhale/backend/contracts";
import { Banknote, RefreshCcw, Truck, Wallet } from "lucide-react";
import { formatINR } from "@/lib/format";
import styles from "./Reassurance.module.css";

/** Purchase reassurance; every figure comes from live store settings. */
export function Reassurance({ config }: { config: StoreConfigDTO }) {
  const items = [
    { icon: Truck, title: "Free delivery", text: `On orders over ${formatINR(config.freeShippingThresholdPaise)} anywhere in India.` },
    {
      icon: RefreshCcw,
      title: `${config.returnWindowDays}-day returns`,
      text: `Return, or exchange for another size, within ${config.returnWindowDays} days of delivery.`,
    },
    ...(config.codEnabled
      ? [
          {
            icon: Banknote,
            title: "Cash on delivery",
            text: "Pay when your order arrives. Our team confirms each COD order before it ships.",
          },
        ]
      : []),
    {
      icon: Wallet,
      title: "Secure payments",
      text: `Cards, UPI and netbanking. Cancel within ${config.cancellationWindowHours} hours of ordering.`,
    },
  ];
  return (
    <ul className={styles.list}>
      {items.map(({ icon: Icon, title, text }) => (
        <li key={title} className={styles.item}>
          <Icon size={22} aria-hidden="true" className={styles.icon} />
          <div>
            <h3 className={styles.title}>{title}</h3>
            <p className={styles.text}>{text}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
