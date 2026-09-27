"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { track } from "@/lib/track";

/** Records one PAGE_VIEW per client-side navigation. */
export function PageViewTracker() {
  const pathname = usePathname();
  useEffect(() => {
    track({ type: "PAGE_VIEW", path: pathname });
  }, [pathname]);
  return null;
}
