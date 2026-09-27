"use client";

import "./globals.css";
import styles from "./global-error.module.css";

/** Last-resort boundary when the root layout itself fails. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en-IN">
      <body>
        <main className={styles.page}>
          <h1>WovenWhale is temporarily unavailable</h1>
          <p>We&apos;re having trouble loading the store. Please try again in a moment.</p>
          <button type="button" onClick={reset}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
