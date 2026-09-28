import type { ProductCardDTO, ProductDetailDTO, StoreConfigDTO } from "@wovenwhale/backend/contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section } from "@/components/store/home/Section";
import { ProductGallery } from "@/components/store/product/ProductGallery";
import { ProductGrid } from "@/components/store/product/ProductGrid";
import { ProductInfo } from "@/components/store/product/ProductInfo";
import { ProductPurchase } from "@/components/store/product/ProductPurchase";
import { RecentlyViewed } from "@/components/store/product/RecentlyViewed";
import { publicApi, publicApiOrNull } from "@/lib/api/server";
import { absolute, breadcrumbJsonLd, jsonLd } from "@/lib/seo";
import styles from "./page.module.css";

type Props = { params: Promise<{ slug: string }> };

const loadProduct = (slug: string) => publicApiOrNull<ProductDetailDTO>(`/catalog/products/${encodeURIComponent(slug)}`, 60);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await loadProduct(slug);
  if (!product) return { title: "Product not found" };
  const image = product.images[0];
  const description = product.seoDescription ?? product.shortDescription ?? `${product.name} — handwoven by WovenWhale.`;
  return {
    title: product.seoTitle ?? product.name,
    description,
    alternates: { canonical: `/product/${product.slug}` },
    openGraph: {
      type: "website",
      title: product.name,
      description,
      url: `/product/${product.slug}`,
      images: image ? [{ url: image.url, alt: image.alt }] : [],
    },
    twitter: { card: "summary_large_image", title: product.name, description, images: image ? [image.url] : [] },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const [product, related, config] = await Promise.all([
    loadProduct(slug),
    publicApi<ProductCardDTO[]>(`/catalog/products/${encodeURIComponent(slug)}/related`, 300).catch(() => []),
    publicApi<StoreConfigDTO>("/catalog/config", 300).catch(() => null),
  ]);
  if (!product) notFound();

  const category = product.primaryCategory;
  const crumbs = [
    { href: "/", label: "Home" },
    ...(category ? [{ href: `/shop/${category.slug}`, label: category.name }] : [{ href: "/shop", label: "Shop" }]),
    { href: `/product/${product.slug}`, label: product.name },
  ];

  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.sku,
    description: product.shortDescription ?? product.description ?? undefined,
    image: product.images.map((i) => absolute(i.url)),
    brand: { "@type": "Brand", name: "WovenWhale" },
    category: category?.name,
    material: product.fabric ?? undefined,
    color: product.color ?? undefined,
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "INR",
      lowPrice: (Math.min(...product.variants.map((v) => v.pricePaise), product.pricePaise) / 100).toFixed(2),
      highPrice: (Math.max(...product.variants.map((v) => v.pricePaise), product.pricePaise) / 100).toFixed(2),
      offerCount: product.variants.length,
      availability: product.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: absolute(`/product/${product.slug}`),
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(productLd)} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(breadcrumbJsonLd(crumbs))} />
      <div className={styles.page}>
        <nav aria-label="Breadcrumb" className={styles.crumbs}>
          <ol>
            {crumbs.map((c, i) => (
              <li key={c.href}>
                {i < crumbs.length - 1 ? <Link href={c.href}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
              </li>
            ))}
          </ol>
        </nav>
        <div className={styles.layout}>
          <div className={styles.gallery} id="product-gallery">
            <ProductGallery images={product.images} name={product.name} />
          </div>
          <div className={styles.details}>
            <ProductPurchase product={product} galleryId="product-gallery" />
            <ProductInfo product={product} config={config} />
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <Section id="related" title="You may also like">
          <ProductGrid products={related.slice(0, 4)} />
        </Section>
      )}
      <RecentlyViewed excludeId={product.id} />
    </>
  );
}
