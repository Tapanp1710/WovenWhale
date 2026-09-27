import { StatusPage } from "@/components/store/content/StatusPage";
import { ButtonLink } from "@/components/ui/ButtonLink";

export default function NotFound() {
  return (
    <StatusPage
      code="404"
      title="We couldn't find that page"
      actions={
        <>
          <ButtonLink href="/shop">Browse the collection</ButtonLink>
          <ButtonLink href="/search" variant="secondary">
            Search
          </ButtonLink>
        </>
      }
    >
      The product may have sold out and been retired, or the link may be mistyped.
    </StatusPage>
  );
}
