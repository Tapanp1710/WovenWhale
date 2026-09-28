import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/admin/auth/AuthCard";
import { LoginForm } from "@/components/admin/auth/LoginForm";
import { getAdmin, type SearchParams } from "@/components/admin/server";
import { safeNext } from "./next";

export const metadata: Metadata = { title: "Sign in" };

export default async function AdminLoginPage({ searchParams }: { searchParams: SearchParams }) {
  const next = safeNext((await searchParams).next);
  if (await getAdmin()) redirect(next);
  return (
    <AuthCard title="Sign in" lede="Use your admin account. Sessions end automatically after a period of inactivity.">
      <LoginForm next={next} />
    </AuthCard>
  );
}
