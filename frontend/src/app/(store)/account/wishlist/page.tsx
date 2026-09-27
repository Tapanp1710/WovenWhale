import type { WishlistItemDTO } from "@wovenwhale/backend/contracts";
import { WishlistView } from "@/components/store/account/WishlistView";
import { sessionApi } from "@/lib/api/server";

export const metadata = { title: "Wishlist" };

export default async function WishlistPage() {
  return <WishlistView initial={await sessionApi<WishlistItemDTO[]>("/wishlist")} />;
}
