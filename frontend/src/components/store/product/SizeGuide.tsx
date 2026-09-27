"use client";

import { Ruler } from "lucide-react";
import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import styles from "./SizeGuide.module.css";

/**
 * Standard Indian menswear body-measurement guide. Individual styles can fit
 * differently, so the guide says so and points to support for garment specs.
 */
const ROWS = [
  { size: "S", chest: "36–38", chestCm: "91–97", neck: "14.5" },
  { size: "M", chest: "38–40", chestCm: "97–102", neck: "15" },
  { size: "L", chest: "40–42", chestCm: "102–107", neck: "15.5–16" },
  { size: "XL", chest: "42–44", chestCm: "107–112", neck: "16.5" },
  { size: "XXL", chest: "44–46", chestCm: "112–117", neck: "17" },
];

export function SizeGuide({ sizes }: { sizes: string[] }) {
  const [open, setOpen] = useState(false);
  const rows = ROWS.filter((r) => sizes.length === 0 || sizes.includes(r.size));
  return (
    <>
      <button type="button" className={styles.trigger} onClick={() => setOpen(true)}>
        <Ruler size={16} aria-hidden="true" /> Size guide
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="Size guide" side="right">
        <div className={styles.body}>
          <p>Body measurements in inches (centimetres in brackets). If you&apos;re between sizes, size up for a relaxed fit.</p>
          <table className={styles.table}>
            <caption className="visually-hidden">Body measurements by size</caption>
            <thead>
              <tr>
                <th scope="col">Size</th>
                <th scope="col">Chest</th>
                <th scope="col">Neck</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.size}>
                  <th scope="row">{r.size}</th>
                  <td>
                    {r.chest} <span>({r.chestCm})</span>
                  </td>
                  <td>{r.neck}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>How to measure</h3>
          <dl className={styles.how}>
            <div>
              <dt>Chest</dt>
              <dd>Measure around the fullest part of your chest, under the arms, keeping the tape level.</dd>
            </div>
            <div>
              <dt>Neck</dt>
              <dd>Measure around the base of your neck, leaving room for one finger under the tape.</dd>
            </div>
          </dl>
          <p className={styles.note}>
            Handwoven fabrics can vary slightly from piece to piece. For exact garment measurements of a style,{" "}
            <a href="/support">ask our team</a>.
          </p>
        </div>
      </Sheet>
    </>
  );
}
