"use server";

import { revalidatePath, updateTag } from "next/cache";
import { can } from "@/components/admin/labels";
import { getAdmin } from "@/components/admin/server";

/**
 * Called by the editor right after a publish: the storefront drops its cached
 * homepage so the next visitor gets the new version (no redeploy involved).
 */
export async function refreshStorefront() {
  const admin = await getAdmin();
  if (!admin || !can(admin, "content.manage")) throw new Error("You don't have permission to do that.");
  updateTag("content");
  revalidatePath("/");
}
