import type { ProductCardDTO } from "@wovenwhale/backend/contracts";
import Image from "next/image";
import Link from "next/link";
import { WishlistButton } from "../product/WishlistButton";
import styles from "./LoomEditorial.module.css";

/** Editorial explainer: a product photograph beside a short piece about the craft. */
export function LoomEditorial({
  id,
  title,
  body,
  items,
  product,
}: {
  id: string;
  title: string;
  body: string;
  items: { name: string; href: string | null; text: string }[];
  product: ProductCardDTO | null;
}) {
  const image = product?.images[0];
  return (
    <section className={styles.editorial} aria-labelledby={`${id}-title`}>
      <div className={styles.media}>
        {product && image && (
          <>
            <Link href={`/product/${product.slug}`} className={styles.imageLink} aria-label={product.name}>
              <Image src={image.url} alt={image.alt} fill sizes="(min-width: 1024px) 45vw, 100vw" className={styles.img} />
            </Link>
            <span className={styles.wish}>
              <WishlistButton productId={product.id} name={product.name} />
            </span>
          </>
        )}
      </div>
      <div className={styles.copy}>
        <h2 id={`${id}-title`} className={styles.title}>
          {title}
        </h2>
        {body && <p className={styles.lede}>{body}</p>}
        {items.length > 0 && (
          <dl className={styles.list}>
            {items.map((t) => (
              <div key={t.name} className={styles.item}>
                <dt>{t.href ? <Link href={t.href}>{t.name}</Link> : t.name}</dt>
                <dd>{t.text}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}
