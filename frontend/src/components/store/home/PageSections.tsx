import type { ResolvedSection, SectionOf, StoreConfigDTO } from "@wovenwhale/backend/contracts";
import Image from "next/image";
import Link from "next/link";
import { Fragment, type CSSProperties, type ReactNode } from "react";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { NewsletterForm } from "../layout/NewsletterForm";
import { ProductGrid } from "../product/ProductGrid";
import styles from "./Blocks.module.css";
import { LoomEditorial } from "./LoomEditorial";
import { Reassurance } from "./Reassurance";
import { Section } from "./Section";
import { WarpHero } from "./WarpHero";
import { WeaveRail } from "./WeaveRail";

const paragraphs = (text: string) => text.split(/\n\s*\n/).filter((p) => p.trim());
const link = (cta: { label: string; href: string } | null) => cta ?? undefined;

/**
 * Renders a page built in the website editor with the storefront's own
 * components. Everything an admin typed is rendered as text, never as markup.
 * `editor` marks each section so the editor preview can select it on click.
 */
export function PageSections({ sections, config, editor = false }: { sections: ResolvedSection[]; config: StoreConfigDTO; editor?: boolean }) {
  const firstHero = sections.findIndex((s) => s.type === "hero");
  return sections.map((s, i) => {
    const node = render(s, config, i === firstHero ? 1 : 2);
    if (!node && !editor) return null;
    return editor ? (
      <div key={s.id} data-section-id={s.id} className={styles.editable}>
        {node ?? <p className={styles.emptyNote}>This section has nothing to show yet, so customers won&apos;t see it.</p>}
      </div>
    ) : (
      <Fragment key={s.id}>{node}</Fragment>
    );
  });
}

function render(s: ResolvedSection, config: StoreConfigDTO, heroLevel: 1 | 2): ReactNode {
  switch (s.type) {
    case "hero":
      return <WarpHero id={s.id} {...s.settings} strips={s.strips ?? []} level={heroLevel} />;
    case "categories":
      return s.categories?.length ? (
        <Section id={s.id} title={s.settings.title} link={link(s.settings.link)}>
          <WeaveRail categories={s.categories} />
        </Section>
      ) : null;
    case "products":
      return s.products?.length ? (
        <Section id={s.id} title={s.settings.title} intro={s.settings.intro || undefined} link={link(s.settings.link)}>
          <ProductGrid products={s.products} columns={s.settings.columns} />
        </Section>
      ) : null;
    case "editorial":
      return <LoomEditorial id={s.id} {...s.settings} product={s.product ?? null} />;
    case "promo":
      return <Promo s={s} count={s.count ?? null} />;
    case "story":
      return (
        <section className={styles.story} aria-labelledby={`${s.id}-title`}>
          <div className={styles.storyText}>
            <h2 id={`${s.id}-title`} className={styles.storyTitle}>
              {s.settings.title}
            </h2>
            {paragraphs(s.settings.body).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            {s.settings.link && (
              <Link href={s.settings.link.href} className={styles.storyLink}>
                {s.settings.link.label}
              </Link>
            )}
          </div>
          {s.settings.showReassurance && <Reassurance config={config} />}
        </section>
      );
    case "newsletter":
      return (
        <section className={styles.newsletter} aria-labelledby={`${s.id}-title`}>
          <h2 id={`${s.id}-title`} className={styles.newsletterTitle}>
            {s.settings.title}
          </h2>
          {s.settings.text && <p>{s.settings.text}</p>}
          <NewsletterForm source="home" tone="light" />
        </section>
      );
    case "banner":
      return <Banner s={s} />;
    case "text":
      return (
        <section className={`${styles.text} ${s.settings.align === "center" ? styles.centered : ""}`}>
          <div className={styles.textInner}>
            {s.settings.heading && <h2 className={styles.textTitle}>{s.settings.heading}</h2>}
            {paragraphs(s.settings.body).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            {s.settings.cta && (
              <ButtonLink href={s.settings.cta.href} variant="secondary">
                {s.settings.cta.label}
              </ButtonLink>
            )}
          </div>
        </section>
      );
    case "gallery":
      return s.settings.images.length ? (
        <section className={styles.gallery} aria-label={s.settings.title || "Gallery"}>
          {s.settings.title && <h2 className={styles.galleryTitle}>{s.settings.title}</h2>}
          <ul className={styles.galleryGrid}>
            {s.settings.images.map((img, i) => {
              const image = <Image src={img.url} alt={img.alt} fill sizes="(min-width: 1024px) 25vw, 50vw" className={styles.cover} />;
              return (
                <li key={i} className={styles.galleryItem}>
                  {img.href ? (
                    <Link href={img.href} className={styles.fill}>
                      {image}
                    </Link>
                  ) : (
                    image
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null;
    case "spacer":
      return <div className={styles[`space-${s.settings.size}`]} aria-hidden="true" />;
  }
}

function Promo({ s, count }: { s: SectionOf<"promo">; count: number | null }) {
  const text = s.settings.text.replaceAll("{count}", String(count ?? "")).replaceAll("{styles}", count === 1 ? "style" : "styles");
  return (
    <section className={styles.promo} aria-labelledby={`${s.id}-title`}>
      <div>
        <h2 id={`${s.id}-title`} className={styles.promoTitle}>
          {s.settings.title}
        </h2>
        {text && <p className={styles.promoText}>{text}</p>}
      </div>
      {s.settings.link && (
        <Link href={s.settings.link.href} className={styles.promoLink}>
          {s.settings.link.label}
        </Link>
      )}
    </section>
  );
}

function Banner({ s }: { s: SectionOf<"banner"> }) {
  const { image, mobileImage, heading, subtitle, cta, align, overlay } = s.settings;
  return (
    <section
      className={`${styles.banner} ${styles[`align-${align}`]}`}
      aria-labelledby={`${s.id}-title`}
      style={{ "--overlay": overlay / 100 } as CSSProperties}
    >
      {image && (
        <Image
          src={image.url}
          alt={image.alt}
          fill
          sizes="(min-width: 1488px) 1440px, 100vw"
          className={`${styles.cover} ${mobileImage ? styles.desktopOnly : ""}`}
        />
      )}
      {mobileImage && <Image src={mobileImage.url} alt={mobileImage.alt} fill sizes="100vw" className={`${styles.cover} ${styles.mobileOnly}`} />}
      {image && <span className={styles.overlay} aria-hidden="true" />}
      <div className={styles.bannerCopy}>
        <h2 id={`${s.id}-title`} className={styles.bannerTitle}>
          {heading}
        </h2>
        {subtitle && <p className={styles.bannerText}>{subtitle}</p>}
        {cta && (
          <ButtonLink href={cta.href} variant="secondary" size="lg">
            {cta.label}
          </ButtonLink>
        )}
      </div>
    </section>
  );
}
