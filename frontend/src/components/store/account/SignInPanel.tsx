"use client";

import { useRouter } from "next/navigation";
import { SignInForm } from "../auth/SignInForm";
import { useSession } from "../providers/SessionProvider";
import styles from "./SignInPanel.module.css";

/** Shown in place of account pages when there's no session. */
export function SignInPanel({ reason }: { reason?: string }) {
  const { setCustomer } = useSession();
  const router = useRouter();
  return (
    <div className={styles.panel}>
      <h1 className={styles.title}>Sign in to your account</h1>
      {reason && <p className={styles.reason}>{reason}</p>}
      <SignInForm
        onSignedIn={(c) => {
          setCustomer(c);
          window.dispatchEvent(new Event("ww:session-changed"));
          router.refresh();
        }}
      />
    </div>
  );
}
