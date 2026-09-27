import Image from "next/image";
import Link from "next/link";
import styles from "./LoomEditorial.module.css";

const TECHNIQUES = [
  {
    name: "Ikat",
    href: "/shop/ikat",
    text: "The threads are tie-dyed before they ever reach the loom. When the weaver lines them up, the pattern appears with the soft, feathered edges ikat is known for.",
  },
  {
    name: "Jamdani",
    href: "/shop/jamdani",
    text: "Motifs are inlaid by hand, one extra weft thread at a time, while the base cloth is woven. It is slow work, and it shows in the fine raised detail.",
  },
  {
    name: "Kalamkari",
    href: "/shop/kalamkari",
    text: "Patterns are drawn or block-printed onto cotton, giving each shirt its artisan-printed motifs and the slight variation of a hand process.",
  },
];

/** Editorial explainer: why a handwoven piece looks and feels the way it does. */
export function LoomEditorial({ imageUrl, imageAlt }: { imageUrl: string | null; imageAlt: string }) {
  return (
    <section className={styles.editorial} aria-labelledby="loom-title">
      <div className={styles.media}>
        {imageUrl && <Image src={imageUrl} alt={imageAlt} fill sizes="(min-width: 1024px) 45vw, 100vw" className={styles.img} />}
      </div>
      <div className={styles.copy}>
        <h2 id="loom-title" className={styles.title}>
          No two pieces come off the loom quite the same
        </h2>
        <p className={styles.lede}>
          Slight shifts in colour and weave are how you know a person, not a machine, made the cloth. Here&apos;s what goes into the three
          techniques you&apos;ll find most often in our collection.
        </p>
        <dl className={styles.list}>
          {TECHNIQUES.map((t) => (
            <div key={t.name} className={styles.item}>
              <dt>
                <Link href={t.href}>{t.name}</Link>
              </dt>
              <dd>{t.text}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
