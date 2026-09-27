import type { ReactNode } from "react";
import styles from "./ChartCard.module.css";

/**
 * Every chart gets a heading, a one-line plain-language summary and a
 * screen-reader table with the exact values it plots.
 */
export function ChartCard({
  title,
  summary,
  rows,
  columns = ["Label", "Value"],
  className,
  children,
}: {
  title: string;
  summary: ReactNode;
  rows: [string, string][];
  columns?: [string, string];
  className?: string;
  children: ReactNode;
}) {
  return (
    <figure className={[styles.card, className].filter(Boolean).join(" ")}>
      <figcaption className={styles.caption}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.summary}>{summary}</p>
      </figcaption>
      <div className={styles.plot} aria-hidden="true">
        {children}
      </div>
      {/* Wrapped: a table ignores the 1px width, the div clips it. */}
      <div className="visually-hidden">
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">{columns[0]}</th>
              <th scope="col">{columns[1]}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, value], i) => (
              <tr key={`${label}-${i}`}>
                <th scope="row">{label}</th>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
