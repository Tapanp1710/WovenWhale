"use client";

import { CircleAlert } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { EmptyState } from "@/components/ui/EmptyState";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <EmptyState
      icon={<CircleAlert size={26} aria-hidden="true" />}
      title="This page couldn't load"
      action={
        <>
          <Button onClick={reset} size="sm">
            Try again
          </Button>{" "}
          <ButtonLink href="/admin" variant="ghost" size="sm">
            Go to the dashboard
          </ButtonLink>
        </>
      }
    >
      The API returned an error or couldn&apos;t be reached. If it keeps happening, check the API server logs
      {error.digest ? ` (reference ${error.digest})` : ""}.
    </EmptyState>
  );
}
