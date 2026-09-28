import type { AdminMfaStatusDTO } from "@wovenwhale/backend/contracts";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/admin/auth/AuthCard";
import { MfaSetup } from "@/components/admin/auth/MfaSetup";
import type { SearchParams } from "@/components/admin/server";
import { sessionApiOrNull } from "@/lib/api/server";
import { safeNext } from "../next";

export const metadata: Metadata = { title: "Set up two-factor authentication" };

export default async function MfaSetupPage({ searchParams }: { searchParams: SearchParams }) {
  const next = safeNext((await searchParams).next);
  const status = await sessionApiOrNull<AdminMfaStatusDTO>("/admin/auth/2fa/status");
  if (!status) redirect(`/admin/login?next=${encodeURIComponent(next)}`);
  if (status.enabled) redirect(status.sessionVerified ? next : `/admin/login/verify?next=${encodeURIComponent(next)}`);
  return (
    <AuthCard
      title="Set up two-factor authentication"
      lede={
        status.required
          ? "Every admin account needs a second step at sign-in. This takes about a minute."
          : "Add a second step at sign-in so a stolen password isn't enough."
      }
    >
      <MfaSetup email={status.email} next={next} />
    </AuthCard>
  );
}
