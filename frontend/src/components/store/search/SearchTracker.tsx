"use client";

import { useEffect } from "react";
import { recentSearches, track } from "@/lib/track";

/** Records a SEARCH event (query only, no identity) and remembers the term locally. */
export function SearchTracker({ query }: { query: string }) {
  useEffect(() => {
    track({ type: "SEARCH", query, path: "/search" });
    recentSearches.add(query);
  }, [query]);
  return null;
}
