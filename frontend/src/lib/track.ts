"use client";

/**
 * Reports the few events only the browser can observe. Uses sendBeacon so it
 * never blocks navigation; failures are ignored (analytics must not break UX).
 * No personal data is sent — the server attaches the anonymous visitor id.
 */
export function track(event: { type: "PAGE_VIEW" | "PRODUCT_VIEW" | "SEARCH"; path?: string; productId?: string; query?: string }) {
  try {
    const body = JSON.stringify(event);
    // text/plain keeps sendBeacon CORS-safelisted; the API parses the JSON body regardless.
    const blob = new Blob([body], { type: "text/plain;charset=UTF-8" });
    if (!navigator.sendBeacon?.("/api/events", blob)) {
      void fetch("/api/events", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true });
    }
  } catch {
    // ignore
  }
}

const RECENT_KEY = "ww:recently-viewed";
const SEARCH_KEY = "ww:recent-searches";

function readList(key: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function pushList(key: string, value: string, max: number) {
  try {
    const next = [value, ...readList(key).filter((v) => v !== value)].slice(0, max);
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // storage unavailable (private mode)
  }
}

export const recentlyViewed = {
  list: () => readList(RECENT_KEY),
  add: (productId: string) => pushList(RECENT_KEY, productId, 12),
};

export const recentSearches = {
  list: () => readList(SEARCH_KEY),
  add: (q: string) => pushList(SEARCH_KEY, q.trim().toLowerCase(), 6),
  clear: () => {
    try {
      localStorage.removeItem(SEARCH_KEY);
    } catch {
      // ignore
    }
  },
};
