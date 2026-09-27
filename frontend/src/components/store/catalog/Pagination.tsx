import Link from "next/link";
import styles from "./Pagination.module.css";

/** Crawlable numbered pagination that preserves the active filters. */
export function Pagination({
  page,
  totalPages,
  basePath,
  params,
}: {
  page: number;
  totalPages: number;
  basePath: string;
  params: URLSearchParams;
}) {
  if (totalPages <= 1) return null;
  const href = (p: number) => {
    const next = new URLSearchParams(params);
    if (p === 1) next.delete("page");
    else next.set("page", String(p));
    const qs = next.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1);

  return (
    <nav className={styles.pagination} aria-label="Pagination">
      {page > 1 ? (
        <Link href={href(page - 1)} className={styles.step} rel="prev">
          Previous
        </Link>
      ) : (
        <span className={styles.step} aria-disabled="true">
          Previous
        </span>
      )}
      <ol className={styles.pages}>
        {pages.map((p, i) => (
          <li key={p}>
            {i > 0 && p - pages[i - 1]! > 1 && <span className={styles.gap}>…</span>}
            <Link href={href(p)} className={styles.page} aria-current={p === page ? "page" : undefined}>
              {p}
            </Link>
          </li>
        ))}
      </ol>
      {page < totalPages ? (
        <Link href={href(page + 1)} className={styles.step} rel="next">
          Next
        </Link>
      ) : (
        <span className={styles.step} aria-disabled="true">
          Next
        </span>
      )}
    </nav>
  );
}
