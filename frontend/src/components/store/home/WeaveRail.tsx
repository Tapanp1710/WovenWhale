import type { HomeFeedDTO } from "@wovenwhale/backend/contracts";
import Image from "next/image";
import Link from "next/link";
import styles from "./WeaveRail.module.css";

/** Collections as tall tiles; scroll-snaps on touch screens, lays out as a grid on desktop. */
export function WeaveRail({ categories }: { categories: HomeFeedDTO["categories"] }) {
  const tiles = categories.filter((c) => c.coverImageUrl && c.slug !== "new-arrivals").slice(0, 8);
  return (
    <ul className={styles.rail}>
      {tiles.map((c) => (
        <li key={c.slug}>
          <Link href={`/shop/${c.slug}`} className={styles.tile}>
            <span className={styles.media}>
              <Image src={c.coverImageUrl!} alt="" fill sizes="(min-width: 1024px) 22vw, 60vw" className={styles.img} />
            </span>
            <span className={styles.name}>{c.name}</span>
            <span className={styles.count}>
              {c.productCount} {c.productCount === 1 ? "style" : "styles"}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
