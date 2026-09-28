"use client";

import { motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { WishlistButton } from "../product/WishlistButton";
import styles from "./WarpHero.module.css";

export interface Strip {
  src: string;
  alt: string;
  productId: string;
  slug: string;
  name: string;
}

/**
 * The page's one orchestrated moment: product photographs cut into tall
 * strips that slide into register like warp threads settling on a loom.
 * Each strip opens its product and can be saved to the wishlist.
 */
export function WarpHero({ strips }: { strips: Strip[] }) {
  const reduce = useReducedMotion();
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.copy}>
        <h1 id="hero-title" className={styles.title}>
          Shirts woven thread by thread on Indian handlooms
        </h1>
        <p className={styles.lede}>Ikat, jamdani and kalamkari, cut into shirts and kurtas you&apos;ll reach for every week.</p>
        <div className={styles.actions}>
          <ButtonLink href="/shop/new-arrivals" size="lg">
            Shop new arrivals
          </ButtonLink>
          <ButtonLink href="/shop" size="lg" variant="secondary">
            Browse everything
          </ButtonLink>
        </div>
      </div>
      <ul className={styles.warp} aria-label="Featured pieces">
        {strips.map((s, i) => (
          <motion.li
            key={s.src}
            className={styles.strip}
            initial={reduce ? false : { y: i % 2 === 0 ? "-14%" : "14%", opacity: 0.2 }}
            animate={{ y: "0%", opacity: 1 }}
            transition={{ duration: 1.3, delay: 0.08 * i, ease: [0.22, 1, 0.36, 1] }}
          >
            <Link href={`/product/${s.slug}`} className={styles.link} aria-label={s.name}>
              <Image src={s.src} alt="" fill sizes="(min-width: 1024px) 12vw, 22vw" preload={i < 3} className={styles.img} />
            </Link>
            <span className={styles.wish}>
              <WishlistButton productId={s.productId} name={s.name} />
            </span>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}
