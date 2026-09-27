import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import styles from "./Pagination.module.css";

/** Page links that keep every other filter in the URL. */
export function Pagination({
  basePath,
  params,
  page,
  totalPages,
  total,
}: {
  basePath: string;
  params: Record<string, string>;
  page: number;
  totalPages: number;
  total: number;
}) {
  const href = (p: number) => {
    const qs = new URLSearchParams({ ...params, page: String(p) });
    if (p === 1) qs.delete("page");
    const s = qs.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  return (
    <nav className={styles.pagination} aria-label="Pagination">
      <p className={styles.summary}>
        {total.toLocaleString("en-IN")} {total === 1 ? "result" : "results"} · page {page} of {totalPages}
      </p>
      <div className={styles.links}>
        {page > 1 ? (
          <Link href={href(page - 1)} className={styles.link} rel="prev">
            <ChevronLeft size={16} aria-hidden="true" /> Previous
          </Link>
        ) : (
          <span className={styles.link} aria-disabled="true">
            <ChevronLeft size={16} aria-hidden="true" /> Previous
          </span>
        )}
        {page < totalPages ? (
          <Link href={href(page + 1)} className={styles.link} rel="next">
            Next <ChevronRight size={16} aria-hidden="true" />
          </Link>
        ) : (
          <span className={styles.link} aria-disabled="true">
            Next <ChevronRight size={16} aria-hidden="true" />
          </span>
        )}
      </div>
    </nav>
  );
}
