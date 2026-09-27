import type { Permission } from "@wovenwhale/backend/contracts";
import {
  BarChart3,
  Boxes,
  FolderTree,
  Gauge,
  HandCoins,
  KeyRound,
  MessageCircle,
  Package,
  ReceiptText,
  ScrollText,
  Settings,
  ShoppingBasket,
  Tags,
  Undo2,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Visible when the admin holds any of these. */
  perms: Permission[];
  badge?: "cod";
}

export const NAV: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", icon: Gauge, perms: ["dashboard.view"] },
      { href: "/admin/analytics", label: "Analytics", icon: BarChart3, perms: ["analytics.view"] },
    ],
  },
  {
    label: "Sales",
    items: [
      { href: "/admin/orders", label: "Orders", icon: ReceiptText, perms: ["orders.view"] },
      { href: "/admin/cod", label: "COD approvals", icon: HandCoins, perms: ["orders.view"], badge: "cod" },
      { href: "/admin/returns", label: "Returns", icon: Undo2, perms: ["returns.view"] },
      { href: "/admin/checkouts", label: "Abandoned checkouts", icon: ShoppingBasket, perms: ["orders.view", "customers.view"] },
      { href: "/admin/customers", label: "Customers", icon: Users, perms: ["customers.view"] },
    ],
  },
  {
    label: "Catalog",
    items: [
      { href: "/admin/products", label: "Products", icon: Package, perms: ["products.view"] },
      { href: "/admin/categories", label: "Categories", icon: FolderTree, perms: ["products.view"] },
      { href: "/admin/inventory", label: "Inventory", icon: Boxes, perms: ["inventory.view"] },
      { href: "/admin/coupons", label: "Coupons", icon: Tags, perms: ["coupons.view", "coupons.manage"] },
    ],
  },
  {
    label: "Store",
    items: [
      { href: "/admin/whatsapp", label: "WhatsApp", icon: MessageCircle, perms: ["whatsapp.view"] },
      { href: "/admin/settings", label: "Settings", icon: Settings, perms: ["settings.manage"] },
      { href: "/admin/settings/admins", label: "Admin users", icon: UserCog, perms: ["admins.manage"] },
      { href: "/admin/settings/roles", label: "Roles", icon: KeyRound, perms: ["admins.manage"] },
      { href: "/admin/audit-logs", label: "Audit log", icon: ScrollText, perms: ["audit.view"] },
    ],
  },
];
