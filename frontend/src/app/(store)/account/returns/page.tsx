import type { ReturnSummaryDTO } from "@wovenwhale/backend/contracts";
import { RotateCcw } from "lucide-react";
import { ReturnList } from "@/components/store/account/ReturnList";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { accountApi } from "@/lib/api/server";

export const metadata = { title: "Returns" };

export default async function AccountReturnsPage() {
  const returns = await accountApi<ReturnSummaryDTO[]>("/returns");
  if (!returns) return null;
  if (returns.length === 0) {
    return (
      <EmptyState
        icon={<RotateCcw size={26} aria-hidden="true" />}
        title="No return requests"
        action={
          <ButtonLink href="/account/orders" variant="secondary">
            Go to your orders
          </ButtonLink>
        }
      >
        To return or exchange an item, open the delivered order and choose “Return or exchange items”.
      </EmptyState>
    );
  }
  return <ReturnList returns={returns} showOrder />;
}
