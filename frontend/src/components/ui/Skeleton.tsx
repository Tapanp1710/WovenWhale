import type { CSSProperties } from "react";
import styles from "./Skeleton.module.css";

/** Placeholder block that matches the shape of the content it stands in for. */
export function Skeleton({ width, height, radius, className }: { width?: string; height?: string; radius?: string; className?: string }) {
  const style = { "--w": width ?? "100%", "--h": height ?? "1em", "--r": radius ?? "4px" } as CSSProperties;
  return <span className={[styles.skeleton, className].filter(Boolean).join(" ")} style={style} aria-hidden="true" />;
}
