"use client";

import {
  defaultSettings,
  pageSectionsSchema,
  SECTION_TYPES,
  type AdminCategoryDTO,
  type AdminPageDTO,
  type PageSection,
  type PageVersionDTO,
  type SectionType,
} from "@wovenwhale/backend/contracts";
import { Reorder, useDragControls } from "framer-motion";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  History,
  Monitor,
  Plus,
  Redo2,
  Smartphone,
  Tablet,
  Trash2,
  Undo2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { refreshStorefront } from "@/app/admin/(panel)/website/actions";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toaster";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/format";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { SectionInspector } from "./SectionInspector";
import styles from "./WebsiteEditor.module.css";

export const SECTION_INFO: Record<SectionType, { label: string; text: string }> = {
  hero: { label: "Hero", text: "Big heading, buttons and photo strips" },
  categories: { label: "Collections", text: "Tiles that open each collection" },
  products: { label: "Products", text: "New, best-selling, a collection or hand-picked" },
  editorial: { label: "Editorial", text: "A photo beside a short story and list" },
  promo: { label: "Promotion strip", text: "A highlighted line with a link" },
  story: { label: "Story", text: "About text, with store promises" },
  newsletter: { label: "Newsletter", text: "Email sign-up" },
  banner: { label: "Banner", text: "Full-width image with heading and button" },
  text: { label: "Text", text: "Heading, paragraphs and a button" },
  gallery: { label: "Gallery", text: "A grid of photos" },
  spacer: { label: "Spacer", text: "Extra space between sections" },
};

const DEVICES = {
  desktop: { width: 1280, label: "Desktop", icon: Monitor },
  tablet: { width: 820, label: "Tablet", icon: Tablet },
  mobile: { width: 390, label: "Mobile", icon: Smartphone },
} as const;
type Device = keyof typeof DEVICES;

const FIELD_NAMES: Record<string, string> = {
  heading: "Heading",
  title: "Title",
  primary: "First button",
  secondary: "Second button",
  cta: "Button",
  link: "Link",
  href: "link",
  label: "text",
  images: "Photos",
  image: "Image",
  mobileImage: "Phone image",
  url: "image",
  categorySlug: "Collection",
  productIds: "Products",
  items: "List",
  name: "name",
};

function summary(s: PageSection): string {
  const v = s.settings as Record<string, unknown>;
  return String(v.heading || v.title || (s.type === "spacer" ? `${v.size === "sm" ? "Small" : v.size === "lg" ? "Large" : "Medium"} space` : ""));
}

function newId(type: SectionType, taken: PageSection[]) {
  for (;;) {
    const id = `${type}-${Math.random().toString(36).slice(2, 7)}`;
    if (!taken.some((s) => s.id === id)) return id;
  }
}

/** History of the draft for undo/redo. Typing into one field counts as one step. */
function useHistory(initial: PageSection[]) {
  const [h, setH] = useState({ stack: [initial], index: 0, key: null as string | null });
  const commit = useCallback((next: PageSection[], key?: string) => {
    setH((cur) => {
      const base = cur.stack.slice(0, cur.index + 1);
      if (key && cur.key === key) {
        base[base.length - 1] = next;
        return { stack: base, index: base.length - 1, key };
      }
      const stack = [...base, next].slice(-100);
      return { stack, index: stack.length - 1, key: key ?? null };
    });
  }, []);
  return {
    sections: h.stack[h.index]!,
    commit,
    canUndo: h.index > 0,
    canRedo: h.index < h.stack.length - 1,
    undo: () => setH((cur) => ({ ...cur, index: Math.max(0, cur.index - 1), key: null })),
    redo: () => setH((cur) => ({ ...cur, index: Math.min(cur.stack.length - 1, cur.index + 1), key: null })),
    /** Swap the current step for the server's copy (same content, normalised). */
    replaceCurrent: (next: PageSection[]) => setH((cur) => ({ ...cur, stack: cur.stack.map((s, i) => (i === cur.index ? next : s)), key: null })),
    reset: (next: PageSection[]) => setH({ stack: [next], index: 0, key: null }),
  };
}

export function WebsiteEditor({ page, versions: initialVersions, categories }: { page: AdminPageDTO; versions: PageVersionDTO[]; categories: AdminCategoryDTO[] }) {
  const router = useRouter();
  const toast = useToast();
  const history = useHistory(page.draft);
  const { sections, commit } = history;
  const [saved, setSaved] = useState(JSON.stringify(page.draft));
  const [live, setLive] = useState({ version: page.publishedVersion, unpublished: page.unpublishedChanges });
  const [versions, setVersions] = useState(initialVersions);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<PageSection | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState<"save" | null>(null);
  const [device, setDevice] = useState<Device>("desktop");
  const [frameKey, setFrameKey] = useState(0);
  const [names, setNames] = useState(page.productNames);
  const [dragOrder, setDragOrder] = useState<PageSection[] | null>(null);

  const dirty = JSON.stringify(sections) !== saved;
  const current = sections.find((s) => s.id === selected) ?? null;

  const problems = useMemo(() => {
    const result = pageSectionsSchema.safeParse(sections);
    const byId = new Map<string, string[]>();
    if (!result.success) {
      for (const issue of result.error.issues) {
        const section = sections[Number(issue.path[0])];
        if (!section) continue;
        const where = issue.path
          .slice(2)
          .filter((p): p is string => typeof p === "string")
          .map((p) => FIELD_NAMES[p] ?? p)
          .join(" ");
        byId.set(section.id, [...(byId.get(section.id) ?? []), where ? `${where}: ${issue.message}` : issue.message]);
      }
    }
    return byId;
  }, [sections]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /* ── Preview frame ── */
  const frame = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 900, height: 700 });
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setStageSize({ width: entry!.contentRect.width, height: entry!.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const postSelection = useCallback((id: string | null) => {
    frame.current?.contentWindow?.postMessage({ source: "ww-editor", type: "select", id }, location.origin);
  }, []);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== frame.current?.contentWindow || e.data?.source !== "ww-preview") return;
      if (e.data.type === "select") setSelected(e.data.id);
      if (e.data.type === "ready") postSelection(selected);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [selected, postSelection]);
  useEffect(() => postSelection(selected), [selected, postSelection]);

  /* ── Editing ── */
  const update = (next: PageSection, field?: string) => commit(sections.map((s) => (s.id === next.id ? next : s)), field ? `${next.id}:${field}` : undefined);
  const move = (index: number, by: -1 | 1) => {
    const next = [...sections];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item!);
    commit(next);
  };
  const add = (type: SectionType) => {
    const section = { id: newId(type, sections), type, hidden: false, settings: defaultSettings(type) } as PageSection;
    const at = selected ? sections.findIndex((s) => s.id === selected) + 1 : sections.length;
    commit([...sections.slice(0, at), section, ...sections.slice(at)]);
    setAdding(false);
    setSelected(section.id);
  };
  const duplicate = (s: PageSection) => {
    const copy = { ...structuredClone(s), id: newId(s.type, sections) };
    const at = sections.findIndex((x) => x.id === s.id) + 1;
    commit([...sections.slice(0, at), copy, ...sections.slice(at)]);
    setSelected(copy.id);
  };

  /* ── Server ── */
  async function saveDraft(): Promise<boolean> {
    if (problems.size) {
      toast.error("Fix the highlighted sections first.");
      return false;
    }
    setBusy("save");
    try {
      const res = await api<AdminPageDTO>("/admin/content/pages/home/draft", { method: "PUT", body: { sections } });
      history.replaceCurrent(res.draft);
      setSaved(JSON.stringify(res.draft));
      setLive({ version: res.publishedVersion, unpublished: res.unpublishedChanges });
      setFrameKey((k) => k + 1);
      toast.success("Draft saved. Customers still see the published version.");
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    if (dirty && !(await saveDraft())) return false;
    try {
      const res = await api<{ version: number; page: AdminPageDTO }>("/admin/content/pages/home/publish", { method: "POST" });
      await refreshStorefront();
      setLive({ version: res.version, unpublished: false });
      setVersions(await api<PageVersionDTO[]>("/admin/content/pages/home/versions"));
      toast.success(`Published. Version ${res.version} is live on the website.`);
      router.refresh();
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    }
  }

  async function restore(version: number) {
    try {
      const res = await api<AdminPageDTO>(`/admin/content/pages/home/versions/${version}/restore`, { method: "POST" });
      history.reset(res.draft);
      setSaved(JSON.stringify(res.draft));
      setNames((n) => ({ ...n, ...res.productNames }));
      setLive({ version: res.publishedVersion, unpublished: res.unpublishedChanges });
      setSelected(null);
      setFrameKey((k) => k + 1);
      setShowHistory(false);
      toast.success(`Version ${version} is in the draft. Publish to put it live.`);
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    }
  }

  const onNames = useCallback((more: Record<string, string>) => setNames((n) => ({ ...n, ...more })), []);
  const order = dragOrder ?? sections;
  const { width: deviceWidth } = DEVICES[device];
  const scale = Math.min(1, stageSize.width / deviceWidth);

  return (
    <div className={styles.editor}>
      <header className={styles.toolbar}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>Website editor</h1>
          <p className={styles.status} aria-live="polite">
            Homepage · {live.version ? `version ${live.version} is live` : "not published yet"}
            {dirty ? " · unsaved changes" : live.unpublished ? " · the draft has changes customers can't see yet" : ""}
          </p>
        </div>
        <div className={styles.group} role="group" aria-label="Preview size">
          {(Object.keys(DEVICES) as Device[]).map((d) => {
            const Icon = DEVICES[d].icon;
            return (
              <button key={d} type="button" className={styles.device} aria-pressed={device === d} onClick={() => setDevice(d)}>
                <Icon size={16} aria-hidden="true" /> {DEVICES[d].label}
              </button>
            );
          })}
        </div>
        <div className={styles.group}>
          <button type="button" className={styles.icon} onClick={history.undo} disabled={!history.canUndo} aria-label="Undo" title="Undo">
            <Undo2 size={17} aria-hidden="true" />
          </button>
          <button type="button" className={styles.icon} onClick={history.redo} disabled={!history.canRedo} aria-label="Redo" title="Redo">
            <Redo2 size={17} aria-hidden="true" />
          </button>
          <Button size="sm" variant="ghost" icon={<History size={16} aria-hidden="true" />} onClick={() => setShowHistory(true)}>
            Versions
          </Button>
          {dirty ? (
            <Button size="sm" variant="secondary" disabled title="Save the draft to preview it">
              Preview
            </Button>
          ) : (
            <a className={styles.previewLink} href="/preview" target="_blank" rel="noopener">
              Preview
            </a>
          )}
          <Button size="sm" variant="secondary" onClick={saveDraft} loading={busy === "save"} disabled={!dirty}>
            Save draft
          </Button>
          <Button size="sm" onClick={() => setPublishing(true)} disabled={!dirty && !live.unpublished}>
            Publish
          </Button>
        </div>
      </header>

      <div className={styles.workspace}>
        <aside className={styles.panel} aria-label={current ? `Edit ${SECTION_INFO[current.type].label}` : "Sections"}>
          {current ? (
            <>
              <button type="button" className={styles.back} onClick={() => setSelected(null)}>
                <ArrowLeft size={16} aria-hidden="true" /> All sections
              </button>
              <h2 className={styles.panelTitle}>{SECTION_INFO[current.type].label}</h2>
              {problems.get(current.id) && (
                <ul className={styles.problems} role="alert">
                  {problems.get(current.id)!.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
              <SectionInspector section={current} onChange={update} ctx={{ categories, productNames: names, onProductNames: onNames }} />
            </>
          ) : (
            <>
              <div className={styles.panelHead}>
                <h2 className={styles.panelTitle}>Homepage sections</h2>
                <Button size="sm" variant="secondary" icon={<Plus size={15} aria-hidden="true" />} onClick={() => setAdding((a) => !a)} aria-expanded={adding}>
                  Add section
                </Button>
              </div>
              {adding && (
                <ul className={styles.addList} aria-label="Section types">
                  {SECTION_TYPES.map((t) => (
                    <li key={t}>
                      <button type="button" className={styles.addItem} onClick={() => add(t)}>
                        <strong>{SECTION_INFO[t].label}</strong>
                        <span>{SECTION_INFO[t].text}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className={styles.help}>Drag to reorder. Click a section, here or in the preview, to edit it.</p>
              <Reorder.Group
                axis="y"
                values={order}
                onReorder={setDragOrder}
                className={styles.sections}
                onPointerUp={() => {
                  if (dragOrder && JSON.stringify(dragOrder.map((s) => s.id)) !== JSON.stringify(sections.map((s) => s.id))) commit(dragOrder);
                  setDragOrder(null);
                }}
              >
                {order.map((s, i) => (
                  <SectionRow
                    key={s.id}
                    section={s}
                    index={i}
                    count={order.length}
                    invalid={problems.has(s.id)}
                    onSelect={() => setSelected(s.id)}
                    onMove={(by) => move(i, by)}
                    onToggle={() => update({ ...s, hidden: !s.hidden })}
                    onDuplicate={() => duplicate(s)}
                    onRemove={() => setRemoving(s)}
                  />
                ))}
              </Reorder.Group>
            </>
          )}
        </aside>

        <div className={styles.stage} ref={stage}>
          <iframe
            key={frameKey}
            ref={frame}
            src="/preview?editor=1"
            title="Draft preview"
            className={styles.frame}
            style={{ width: deviceWidth, height: stageSize.height / scale, transform: `scale(${scale})` }}
          />
          {dirty && <p className={styles.stale}>The preview shows the last saved draft. Save to see your latest changes.</p>}
        </div>
      </div>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove this section?"
        description={`“${removing ? summary(removing) || SECTION_INFO[removing.type].label : ""}” comes off the draft. Undo brings it back, and published versions keep it. To take it off the website for a while instead, hide it.`}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        onConfirm={async () => {
          if (removing) commit(sections.filter((s) => s.id !== removing.id));
          if (selected === removing?.id) setSelected(null);
          return true;
        }}
      />
      <ConfirmDialog
        open={publishing}
        onOpenChange={setPublishing}
        title="Publish website changes?"
        description="These changes will become visible to customers."
        confirmLabel="Publish"
        cancelLabel="Cancel"
        confirmVariant="primary"
        onConfirm={publish}
      />
      <ConfirmDialog
        open={restoring !== null}
        onOpenChange={(o) => !o && setRestoring(null)}
        title={`Restore version ${restoring ?? ""} into the draft?`}
        description="It replaces your current draft. Nothing changes for customers until you publish."
        confirmLabel="Restore to draft"
        cancelLabel="Cancel"
        confirmVariant="primary"
        onConfirm={() => restore(restoring!)}
      />
      <Sheet open={showHistory} onOpenChange={setShowHistory} title="Versions" description="Every publish is kept. Restore copies a version into the draft.">
        <ol className={styles.versions}>
          {versions.map((v) => (
            <li key={v.version} className={styles.version}>
              <div>
                <strong>Version {v.version}</strong> {v.live && <span className={styles.liveBadge}>Live</span>}
                <p className={styles.meta}>
                  {formatDateTime(v.publishedAt)} · {v.publishedBy ?? "System (original homepage)"} · {v.sectionCount} sections
                </p>
              </div>
              <div className={styles.inline}>
                <a className={styles.textLink} href={`/preview?version=${v.version}`} target="_blank" rel="noopener">
                  Preview
                </a>
                <Button size="sm" variant="secondary" onClick={() => setRestoring(v.version)}>
                  Restore
                </Button>
              </div>
            </li>
          ))}
        </ol>
      </Sheet>
    </div>
  );
}

function SectionRow({
  section,
  index,
  count,
  invalid,
  onSelect,
  onMove,
  onToggle,
  onDuplicate,
  onRemove,
}: {
  section: PageSection;
  index: number;
  count: number;
  invalid: boolean;
  onSelect: () => void;
  onMove: (by: -1 | 1) => void;
  onToggle: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const drag = useDragControls();
  const info = SECTION_INFO[section.type];
  const name = summary(section) || info.label;
  return (
    <Reorder.Item
      value={section}
      dragListener={false}
      dragControls={drag}
      className={`${styles.row} ${section.hidden ? styles.hiddenRow : ""} ${invalid ? styles.invalidRow : ""}`}
      data-section-row={section.id}
    >
      <button type="button" className={styles.grip} onPointerDown={(e) => drag.start(e)} aria-label={`Drag ${name}`}>
        <GripVertical size={16} aria-hidden="true" />
      </button>
      <button type="button" className={styles.rowMain} onClick={onSelect} aria-label={`Edit ${info.label}: ${name}`}>
        <span className={styles.rowType}>
          {info.label}
          {section.hidden && <span className={styles.hiddenBadge}>Hidden</span>}
          {invalid && <span className={styles.errorBadge}>Needs a fix</span>}
        </span>
        <span className={styles.rowName}>{summary(section)}</span>
      </button>
      <span className={styles.rowTools}>
        <button type="button" className={styles.tool} onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move ${name} up`}>
          <ArrowUp size={15} aria-hidden="true" />
        </button>
        <button type="button" className={styles.tool} onClick={() => onMove(1)} disabled={index === count - 1} aria-label={`Move ${name} down`}>
          <ArrowDown size={15} aria-hidden="true" />
        </button>
        <button type="button" className={styles.tool} onClick={onToggle} aria-label={`${section.hidden ? "Show" : "Hide"} ${name}`} aria-pressed={section.hidden}>
          {section.hidden ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
        </button>
        <button type="button" className={styles.tool} onClick={onDuplicate} aria-label={`Duplicate ${name}`}>
          <Copy size={15} aria-hidden="true" />
        </button>
        <button type="button" className={`${styles.tool} ${styles.danger}`} onClick={onRemove} aria-label={`Remove ${name}`}>
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </span>
    </Reorder.Item>
  );
}
