"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Heart } from "lucide-react";
import { useWishlist } from "../providers/WishlistProvider";
import styles from "./WishlistButton.module.css";

export function WishlistButton({
  productId,
  name,
  variant = "overlay",
}: {
  productId: string;
  name: string;
  variant?: "overlay" | "inline";
}) {
  const { has, toggle } = useWishlist();
  const saved = has(productId);
  const reduce = useReducedMotion();
  return (
    <button
      type="button"
      className={`${styles.button} ${styles[variant]}`}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${name} from wishlist` : `Save ${name} to wishlist`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(productId, name);
      }}
    >
      <motion.span
        key={String(saved)}
        className={styles.icon}
        initial={reduce || !saved ? false : { scale: 0.6 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 18 }}
      >
        <Heart size={variant === "inline" ? 20 : 18} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
      </motion.span>
      {variant === "inline" && <span>{saved ? "Saved" : "Save"}</span>}
    </button>
  );
}
