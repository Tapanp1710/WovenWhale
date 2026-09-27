import { Lock } from "lucide-react";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { EmptyState } from "@/components/ui/EmptyState";

/** Shown when the admin's role lacks the permission a page needs. */
export function NoAccess({ what }: { what: string }) {
  return (
    <EmptyState
      icon={<Lock size={26} aria-hidden="true" />}
      title="You don't have access to this page"
      action={
        <ButtonLink href="/admin" variant="secondary" size="sm">
          Go to the dashboard
        </ButtonLink>
      }
    >
      Your role can't view {what}. Ask a super admin if you need it.
    </EmptyState>
  );
}
