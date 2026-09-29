"use client";

import { useEffect } from "react";

type EditorMessage = { source: "ww-editor"; type: "select"; id: string | null };

/**
 * Runs inside the editor's preview frame: a click on a section selects it in
 * the editor instead of following links, and the editor's selection is
 * outlined and scrolled into view. Messages are same-origin only.
 */
export function PreviewBridge() {
  useEffect(() => {
    const post = (data: object) => window.parent.postMessage({ source: "ww-preview", ...data }, location.origin);
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element;
      const section = target.closest("[data-section-id]");
      if (!section && !target.closest("a, button")) return;
      e.preventDefault();
      e.stopPropagation();
      if (section) post({ type: "select", id: section.getAttribute("data-section-id") });
    };
    const onSubmit = (e: Event) => e.preventDefault();
    const onMessage = (e: MessageEvent<EditorMessage>) => {
      if (e.origin !== location.origin || e.data?.source !== "ww-editor" || e.data.type !== "select") return;
      document.querySelectorAll("[data-section-id]").forEach((el) => {
        const selected = el.getAttribute("data-section-id") === e.data.id;
        el.setAttribute("data-selected", String(selected));
        if (selected) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener("message", onMessage);
    post({ type: "ready" });
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("message", onMessage);
    };
  }, []);
  return null;
}
