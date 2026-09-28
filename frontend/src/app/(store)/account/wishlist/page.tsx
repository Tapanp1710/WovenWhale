import type { WishlistItemDTO } from "@wovenwhale/backend/contracts";
import { WishlistView } from "@/components/store/account/WishlistView";
import { accountApi } from "@/lib/api/server";

export const metadata = { title: "Wishlist" };

export default async function WishlistPage() {
  const items = await accountApi<WishlistItemDTO[]>("/wishlist");
  return items && <WishlistView initial={items} />;
}
