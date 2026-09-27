import type { Metadata } from "next";
import { CartPageView } from "@/components/store/cart/CartPageView";

export const metadata: Metadata = { title: "Your bag", robots: { index: false, follow: true } };

export default function CartPage() {
  return <CartPageView />;
}
