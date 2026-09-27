import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./Section.module.css";

/** Content section with a heading and an optional "see all" link on the same baseline. */
export function Section({
  id,
  title,
  link,
  intro,
  children,
}: {
  id: string;
  title: string;
  link?: { href: string; label: string };
  intro?: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.section} aria-labelledby={id}>
      <div className={styles.head}>
        <div className={styles.text}>
          <h2 id={id} className={styles.title}>
            {title}
          </h2>
          {intro && <p className={styles.intro}>{intro}</p>}
        </div>
        {link && (
          <Link href={link.href} className={styles.link}>
            {link.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
