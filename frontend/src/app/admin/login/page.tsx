import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/auth/LoginForm";
import { getAdmin, type SearchParams } from "@/components/admin/server";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Sign in" };

/** Only same-site admin paths are honoured, so `next` can't become an open redirect. */
const safeNext = (value: unknown) =>
  typeof value === "string" && value.startsWith("/admin") && !value.startsWith("/admin/login") ? value : "/admin";

export default async function AdminLoginPage({ searchParams }: { searchParams: SearchParams }) {
  const next = safeNext((await searchParams).next);
  if (await getAdmin()) redirect(next);
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/favicon.svg" alt="" width={40} height={40} />
          <div>
            <p className={styles.wordmark}>WovenWhale</p>
            <p className={styles.sub}>Operations console</p>
          </div>
        </div>
        <h1 className={styles.title}>Sign in</h1>
        <p className={styles.lede}>Use your admin account. Sessions end automatically after a period of inactivity.</p>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
