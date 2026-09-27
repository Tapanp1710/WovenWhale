"use client";

import { useEffect } from "react";
import { StatusPage } from "@/components/store/content/StatusPage";
import { Button } from "@/components/ui/Button";
import { ButtonLink } from "@/components/ui/ButtonLink";

/** Storefront error boundary. Keeps header/footer, explains, and offers a retry. */
export default function StoreError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surfaced in the browser console; server errors are reported by the API's monitoring seam.
    console.error(error);
  }, [error]);

  return (
    <StatusPage
      title="This page didn't load"
      actions={
        <>
          <Button onClick={reset}>Try again</Button>
          <ButtonLink href="/" variant="secondary">
            Go to the homepage
          </ButtonLink>
        </>
      }
    >
      Something went wrong while loading this page. Your bag and account are safe. Try again in a moment.
      {error.digest && <> Reference: {error.digest}.</>}
    </StatusPage>
  );
}
