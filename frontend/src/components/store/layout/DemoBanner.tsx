import type { StoreConfigDTO } from "@wovenwhale/backend/contracts";
import styles from "./DemoBanner.module.css";

/** Shown on every storefront page of a demo deployment (DEMO_MODE), so nobody mistakes it for the real shop. */
export function DemoBanner({ demo }: { demo: NonNullable<StoreConfigDTO["demo"]> }) {
  return (
    <div className={styles.banner} role="note">
      <strong>Demo store.</strong>{" "}
      {demo.payments === "mock" ? "Payments are simulated and nothing is charged." : "Payments run in Razorpay test mode; use a test card."}
      {demo.otpCode && ` Sign in with any 10-digit mobile number and the code ${demo.otpCode}.`}
    </div>
  );
}
