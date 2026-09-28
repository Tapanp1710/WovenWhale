"use client";

import type { ImageDTO } from "@wovenwhale/backend/contracts";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ZoomIn } from "lucide-react";
import Image from "next/image";
import { forwardRef, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { Sheet } from "@/components/ui/Sheet";
import styles from "./ProductGallery.module.css";

/**
 * Desktop: thumbnails + main image with hover zoom that follows the pointer.
 * Mobile: swipeable scroll-snap strip with position dots.
 * Any device: tap/click opens a full-screen viewer.
 */
export const ProductGallery = forwardRef<HTMLDivElement, { images: ImageDTO[]; name: string }>(function ProductGallery(
  { images, name },
  ref,
) {
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const [viewer, setViewer] = useState(false);
  const strip = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const current = images[active];

  if (images.length === 0) return <div className={styles.placeholder} ref={ref} aria-label={`${name} — image coming soon`} />;

  const onMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
  };

  const onScroll = () => {
    const el = strip.current;
    if (!el) return;
    setActive(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <div className={styles.gallery} ref={ref}>
      {images.length > 1 && (
        <ul className={styles.thumbs} aria-label="Product images">
          {images.map((img, i) => (
            <li key={img.id}>
              <button
                type="button"
                className={styles.thumb}
                aria-current={i === active}
                aria-label={`Show image ${i + 1} of ${images.length}`}
                onClick={() => setActive(i)}
              >
                <Image src={img.url} alt="" fill sizes="80px" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Desktop main image */}
      <button
        type="button"
        className={styles.main}
        onPointerMove={onMove}
        onPointerLeave={() => setZoom(null)}
        onClick={() => setViewer(true)}
        aria-label={`Open ${name} image ${active + 1} full screen`}
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={current!.id}
            className={styles.frame}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <Image
              src={current!.url}
              alt={current!.alt}
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              preload={active === 0}
              quality={90}
              className={`${styles.image} ${zoom ? styles.zoomed : ""}`}
              style={zoom ? ({ "--zx": `${zoom.x}%`, "--zy": `${zoom.y}%` } as CSSProperties) : undefined}
            />
          </motion.span>
        </AnimatePresence>
        <span className={styles.zoomHint} aria-hidden="true">
          <ZoomIn size={16} /> Hover to zoom, click to expand
        </span>
      </button>

      {/* Mobile swipe strip */}
      <div className={styles.strip} ref={strip} onScroll={onScroll}>
        {images.map((img, i) => (
          <button
            key={img.id}
            type="button"
            className={styles.slide}
            onClick={() => setViewer(true)}
            aria-label={`Open image ${i + 1} of ${images.length} full screen`}
          >
            <Image src={img.url} alt={img.alt} fill sizes="(min-width: 1024px) 50vw, 100vw" preload={i === 0} className={styles.image} />
          </button>
        ))}
      </div>
      {images.length > 1 && (
        <div className={styles.dots} aria-hidden="true">
          {images.map((img, i) => (
            <span key={img.id} data-active={i === active || undefined} />
          ))}
        </div>
      )}

      <Sheet open={viewer} onOpenChange={setViewer} title={`${name} photos`} hideTitle side="bottom">
        <ul className={styles.viewer}>
          {images.map((img) => (
            <li key={img.id}>
              <Image
                src={img.url}
                alt={img.alt}
                width={img.width ?? 960}
                height={img.height ?? 1280}
                sizes="100vw"
                quality={90}
                className={styles.viewerImage}
              />
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
});
