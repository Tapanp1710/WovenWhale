import type { HomeFeedDTO, StoreConfigDTO } from "@wovenwhale/backend/contracts";
import Link from "next/link";
import { LoomEditorial } from "@/components/store/home/LoomEditorial";
import { Reassurance } from "@/components/store/home/Reassurance";
import { Section } from "@/components/store/home/Section";
import { WarpHero } from "@/components/store/home/WarpHero";
import { WeaveRail } from "@/components/store/home/WeaveRail";
import { NewsletterForm } from "@/components/store/layout/NewsletterForm";
import { ProductGrid } from "@/components/store/product/ProductGrid";
import { publicApi } from "@/lib/api/server";
import { SITE_URL } from "@/lib/format";
import { jsonLd } from "@/lib/seo";
import styles from "./page.module.css";

export const revalidate = 60;

export default async function HomePage() {
  const [feed, config] = await Promise.all([publicApi<HomeFeedDTO>("/catalog/home"), publicApi<StoreConfigDTO>("/catalog/config", 300)]);

  // Hero strips: second (detail) shots read best as narrow threads.
  const heroProducts = [...feed.featured, ...feed.newArrivals].filter((p, i, all) => all.findIndex((x) => x.id === p.id) === i);
  const strips = heroProducts
    .slice(0, 6)
    .map((p) => p.images[1] ?? p.images[0])
    .filter((img): img is NonNullable<typeof img> => Boolean(img))
    .map((img) => ({ src: img.url, alt: img.alt }));
  const editorialImage = feed.bestSellers[0]?.images[0] ?? feed.featured[0]?.images[0] ?? null;
  const clearance = feed.categories.find((c) => c.slug === "sale");

  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "WovenWhale",
    url: SITE_URL,
    logo: `${SITE_URL}/brand/wovenwhale-logo.jpeg`,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(organization)} />
      <WarpHero strips={strips} />

      <Section id="weaves" title="Shop by weave" link={{ href: "/shop", label: "See every style" }}>
        <WeaveRail categories={feed.categories} />
      </Section>

      {feed.newArrivals.length > 0 && (
        <Section
          id="new"
          title="New on the loom"
          intro="The latest handwoven pieces, in limited runs."
          link={{ href: "/shop/new-arrivals", label: "All new arrivals" }}
        >
          <ProductGrid products={feed.newArrivals.slice(0, 8)} />
        </Section>
      )}

      <LoomEditorial imageUrl={editorialImage?.url ?? null} imageAlt={editorialImage?.alt ?? ""} />

      {feed.bestSellers.length > 0 && (
        <Section
          id="best"
          title="Most loved"
          intro="The styles customers come back for."
          link={{ href: "/shop?sort=best-selling", label: "Shop best sellers" }}
        >
          <ProductGrid products={feed.bestSellers.slice(0, 4)} />
        </Section>
      )}

      {clearance && (
        <section className={styles.promo} aria-labelledby="clearance-title">
          <div>
            <h2 id="clearance-title" className={styles.promoTitle}>
              Clearance
            </h2>
            <p className={styles.promoText}>
              {clearance.productCount} past-season {clearance.productCount === 1 ? "style" : "styles"} at reduced prices, while sizes last.
            </p>
          </div>
          <Link href={`/shop/${clearance.slug}`} className={styles.promoLink}>
            Shop clearance
          </Link>
        </section>
      )}

      {feed.featured.length > 0 && (
        <Section id="featured" title="Picked for the season" link={{ href: "/shop", label: "Shop all" }}>
          <ProductGrid products={feed.featured.slice(0, 4)} />
        </Section>
      )}

      <section className={styles.story} aria-labelledby="story-title">
        <div className={styles.storyText}>
          <h2 id="story-title" className={styles.storyTitle}>
            Made slowly, on purpose
          </h2>
          <p>
            WovenWhale works with handloom weavers to turn traditional textiles into shirts and kurtas cut for the way you dress now. Fewer
            pieces, made with care, meant to be worn for years.
          </p>
          <Link href="/about" className={styles.storyLink}>
            Read our story
          </Link>
        </div>
        <Reassurance config={config} />
      </section>

      <section className={styles.newsletter} aria-labelledby="newsletter-title">
        <h2 id="newsletter-title" className={styles.newsletterTitle}>
          Hear about new weaves first
        </h2>
        <p>One email when a new collection comes off the loom. No spam, unsubscribe anytime.</p>
        <NewsletterForm source="home" tone="light" />
      </section>
    </>
  );
}
