"use client";

import type { ContentImageDTO } from "@wovenwhale/backend/contracts";
import { motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ButtonLink } from "@/components/ui/ButtonLink";
import styles from "./WarpHero.module.css";

type Cta = { label: string; href: string } | null;

/**
 * The page's one orchestrated moment: photographs cut into tall strips that
 * slide into register like warp threads settling on a loom. Each strip opens
 * its product (or the link set in the website editor).
 */
export function WarpHero({
  id,
  heading,
  subtitle,
  primary,
  secondary,
  align = "left",
  strips,
  level = 1,
}: {
  id: string;
  heading: string;
  subtitle: string;
  primary: Cta;
  secondary: Cta;
  align?: "left" | "center";
  strips: ContentImageDTO[];
  /** Only the first hero on a page is the page's h1. */
  level?: 1 | 2;
}) {
  const reduce = useReducedMotion();
  const Heading = level === 1 ? "h1" : "h2";
  // Each strip's share of the width (the strips take ~55% of a desktop screen).
  const sizes = `(min-width: 1024px) ${Math.ceil(55 / Math.min(strips.length || 1, 6))}vw, ${Math.ceil(95 / Math.min(strips.length || 1, 4))}vw`;
  return (
    <section
      className={[styles.hero, align === "center" && styles.center, strips.length === 0 && styles.solo].filter(Boolean).join(" ")}
      aria-labelledby={`${id}-title`}
    >
      <div className={styles.copy}>
        <Heading id={`${id}-title`} className={styles.title}>
          {heading}
        </Heading>
        {subtitle && <p className={styles.lede}>{subtitle}</p>}
        {(primary || secondary) && (
          <div className={styles.actions}>
            {primary && (
              <ButtonLink href={primary.href} size="lg">
                {primary.label}
              </ButtonLink>
            )}
            {secondary && (
              <ButtonLink href={secondary.href} size="lg" variant="secondary">
                {secondary.label}
              </ButtonLink>
            )}
          </div>
        )}
      </div>
      {strips.length > 0 && (
        <ul
          className={styles.warp}
          aria-label="Featured pieces"
          // Fewer photos than columns: the strips widen rather than leave gaps.
          style={{ "--strips-sm": Math.min(strips.length, 4), "--strips-lg": Math.min(strips.length, 6) } as CSSProperties}
        >
          {strips.map((s, i) => {
            const img = <Image src={s.src} alt="" fill sizes={sizes} preload={i < 3} className={styles.img} />;
            return (
              <motion.li
                key={`${i}-${s.src}`}
                className={styles.strip}
                initial={reduce ? false : { y: i % 2 === 0 ? "-14%" : "14%", opacity: 0.2 }}
                animate={{ y: "0%", opacity: 1 }}
                transition={{ duration: 1.3, delay: 0.08 * i, ease: [0.22, 1, 0.36, 1] }}
              >
                {s.href ? (
                  <Link href={s.href} className={styles.link} aria-label={s.label}>
                    {img}
                  </Link>
                ) : (
                  <span className={styles.link} role="img" aria-label={s.alt || s.label}>
                    {img}
                  </span>
                )}
              </motion.li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
