import type { PageSection } from "../contracts/content";

export interface SectionChanges {
  added: string[];
  removed: string[];
  moved: string[];
  hidden: string[];
  shown: string[];
  updated: string[];
}

/** What changed between two versions of a page, by section id (drives the audit trail). */
export function diffSections(before: PageSection[], after: PageSection[]): SectionChanges {
  const prev = new Map(before.map((s) => [s.id, s]));
  const next = new Map(after.map((s) => [s.id, s]));
  const changes: SectionChanges = { added: [], removed: [], moved: [], hidden: [], shown: [], updated: [] };

  for (const s of after) {
    const old = prev.get(s.id);
    if (!old) {
      changes.added.push(s.id);
      continue;
    }
    if (!old.hidden && s.hidden) changes.hidden.push(s.id);
    if (old.hidden && !s.hidden) changes.shown.push(s.id);
    if (old.type !== s.type || JSON.stringify(old.settings) !== JSON.stringify(s.settings)) changes.updated.push(s.id);
  }
  for (const s of before) if (!next.has(s.id)) changes.removed.push(s.id);

  // Moved: sections kept on both sides whose position relative to each other changed.
  const keptBefore = before.filter((s) => next.has(s.id)).map((s) => s.id);
  const keptAfter = after.filter((s) => prev.has(s.id)).map((s) => s.id);
  changes.moved = keptAfter.filter((id, i) => keptBefore[i] !== id);
  return changes;
}

export const hasChanges = (c: SectionChanges) => Object.values(c).some((ids) => ids.length > 0);
