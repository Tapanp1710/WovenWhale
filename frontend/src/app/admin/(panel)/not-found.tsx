import { SearchX } from "lucide-react";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { EmptyState } from "@/components/ui/EmptyState";

export default function AdminNotFound() {
  return (
    <EmptyState
      icon={<SearchX size={26} aria-hidden="true" />}
      title="Nothing here"
      action={
        <ButtonLink href="/admin" variant="secondary" size="sm">
          Go to the dashboard
        </ButtonLink>
      }
    >
      The record may have been deleted, or the link is wrong.
    </EmptyState>
  );
}
