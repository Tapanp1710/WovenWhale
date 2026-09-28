import type { AdminMfaStatusDTO } from "@wovenwhale/backend/contracts";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/admin/auth/AuthCard";
import { MfaVerifyForm } from "@/components/admin/auth/MfaVerifyForm";
import type { SearchParams } from "@/components/admin/server";
import { sessionApiOrNull } from "@/lib/api/server";
import { safeNext } from "../next";

export const metadata: Metadata = { title: "Two-factor verification" };

export default async function MfaVerifyPage({ searchParams }: { searchParams: SearchParams }) {
  const next = safeNext((await searchParams).next);
  const status = await sessionApiOrNull<AdminMfaStatusDTO>("/admin/auth/2fa/status");
  if (!status) redirect(`/admin/login?next=${encodeURIComponent(next)}`);
  if (status.sessionVerified) redirect(next);
  if (!status.enabled) redirect(`/admin/login/setup?next=${encodeURIComponent(next)}`);
  return (
    <AuthCard title="Two-factor verification" lede={`Signed in as ${status.email}. Enter a code to finish signing in.`}>
      <MfaVerifyForm next={next} />
    </AuthCard>
  );
}
