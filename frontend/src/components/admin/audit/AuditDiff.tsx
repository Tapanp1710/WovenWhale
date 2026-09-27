import styles from "./AuditDiff.module.css";

type Snapshot = Record<string, unknown> | null;

const show = (v: unknown) => (v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v));

/** Changed fields only; unchanged keys (updatedAt aside) are noise in an audit trail. */
export function diffRows(before: Snapshot, after: Snapshot) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  return keys
    .map((key) => ({ key, before: show(before?.[key]), after: show(after?.[key]) }))
    .filter((r) => r.before !== r.after && r.key !== "updatedAt");
}

export function AuditDiff({ before, after }: { before: Snapshot; after: Snapshot }) {
  const rows = diffRows(before, after);
  if (!rows.length) return <p className={styles.none}>No field changes recorded.</p>;
  return (
    <table className={styles.diff}>
      <thead>
        <tr>
          <th scope="col">Field</th>
          <th scope="col">Before</th>
          <th scope="col">After</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <th scope="row">{r.key}</th>
            <td className={styles.before}>{r.before || <span className={styles.empty}>empty</span>}</td>
            <td className={styles.after}>{r.after || <span className={styles.empty}>empty</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
