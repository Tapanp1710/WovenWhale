import { describe, expect, it } from "vitest";
import { DEFAULT_HOME_SECTIONS, defaultSettings, pageSectionsSchema, SECTION_TYPES, type PageSection } from "../../src/contracts/content";
import { diffSections } from "../../src/domain/content";

const home = DEFAULT_HOME_SECTIONS;
const byId = (id: string) => home.find((s) => s.id === id)!;

describe("website sections", () => {
  it("the built-in homepage is a valid page, and so is every new section", () => {
    expect(pageSectionsSchema.safeParse(home).success).toBe(true);
    const fresh = SECTION_TYPES.map((type, i) => ({ id: `s-${i}`, type, hidden: false, settings: defaultSettings(type) }));
    expect(pageSectionsSchema.safeParse(fresh).success).toBe(true);
  });

  it("refuses script links, foreign images, unknown section types and duplicate ids", () => {
    const hero = byId("hero") as Extract<PageSection, { type: "hero" }>;
    const withLink = (href: string) => [{ ...hero, settings: { ...hero.settings, primary: { label: "Go", href } } }];
    for (const href of ["javascript:alert(1)", "//evil.example", "data:text/html,x", "/shop/../admin", "http://plain.example"]) {
      expect(pageSectionsSchema.safeParse(withLink(href)).success, href).toBe(false);
    }
    expect(pageSectionsSchema.safeParse(withLink("/shop/ikat")).success).toBe(true);
    expect(pageSectionsSchema.safeParse(withLink("https://instagram.com/wovenwhale")).success).toBe(true);

    const withImage = (url: string) => [{ ...hero, settings: { ...hero.settings, images: [{ url, alt: "", href: null }] } }];
    expect(pageSectionsSchema.safeParse(withImage("https://evil.example/x.png")).success).toBe(false);
    expect(pageSectionsSchema.safeParse(withImage("/catalog/../../etc/passwd")).success).toBe(false);
    expect(pageSectionsSchema.safeParse(withImage("/api/files/media/2026/abc.webp")).success).toBe(true);

    expect(pageSectionsSchema.safeParse([{ id: "x1", type: "script", hidden: false, settings: { code: "alert(1)" } }]).success).toBe(false);
    expect(pageSectionsSchema.safeParse([home[0], { ...home[1]!, id: home[0]!.id }]).success).toBe(false);
  });

  it("a product section needs a collection or products for those sources", () => {
    const grid = byId("new") as Extract<PageSection, { type: "products" }>;
    const withSource = (settings: Partial<typeof grid.settings>) => [{ ...grid, settings: { ...grid.settings, ...settings } }];
    expect(pageSectionsSchema.safeParse(withSource({ source: "category", categorySlug: null })).success).toBe(false);
    expect(pageSectionsSchema.safeParse(withSource({ source: "category", categorySlug: "ikat" })).success).toBe(true);
    expect(pageSectionsSchema.safeParse(withSource({ source: "selected", productIds: [] })).success).toBe(false);
  });
});

describe("draft changes (audit trail)", () => {
  it("names each kind of change by section", () => {
    const hero = byId("hero") as Extract<PageSection, { type: "hero" }>;
    const next: PageSection[] = [
      { ...hero, settings: { ...hero.settings, heading: "New heading" } }, // updated
      byId("new"), // "weaves" removed, so "new" now follows the hero
      { ...byId("best"), hidden: true }, // hidden, and moved above "loom"
      byId("loom"),
      ...home.filter((s) => !["hero", "weaves", "new", "best", "loom"].includes(s.id)),
      { id: "s-banner", type: "banner", hidden: false, settings: defaultSettings("banner") }, // added
    ];
    const changes = diffSections(home, next);
    expect(changes.updated).toEqual(["hero"]);
    expect(changes.removed).toEqual(["weaves"]);
    expect(changes.hidden).toEqual(["best"]);
    expect(changes.added).toEqual(["s-banner"]);
    expect(changes.moved).toEqual(["best", "loom"]);
    expect(changes.shown).toEqual([]);
  });

  it("reports nothing when nothing changed", () => {
    const changes = diffSections(home, structuredClone(home));
    expect(Object.values(changes).flat()).toEqual([]);
  });
});
