import type { ProductDetailDTO, StoreConfigDTO } from "@wovenwhale/backend/contracts";
import { formatINR } from "@/lib/format";
import styles from "./ProductInfo.module.css";

/** Descriptions are stored as plain text; paragraphs render as text, never as HTML. */
function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <p key={i}>{p}</p>
        ))}
    </>
  );
}

export function ProductInfo({ product, config }: { product: ProductDetailDTO; config: StoreConfigDTO | null }) {
  const details: [string, string | null][] = [
    ["Weave or print", product.pattern],
    ["Fabric", product.fabric],
    ["Colour", product.color],
    ["Type", product.productType],
    ["SKU", product.sku],
  ];
  return (
    <div className={styles.info}>
      <details open className={styles.item}>
        <summary>Description</summary>
        <div className={styles.content}>
          {product.description ? <Paragraphs text={product.description} /> : <p>{product.shortDescription}</p>}
        </div>
      </details>
      <details className={styles.item}>
        <summary>Product details</summary>
        <dl className={styles.details}>
          {details
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
        </dl>
        <p className={styles.care}>
          Care: hand wash separately in cold water with a mild detergent and dry in shade. Slight irregularities in weave and colour are
          natural to handloom fabric.
        </p>
      </details>
      <details className={styles.item}>
        <summary>Delivery</summary>
        <div className={styles.content}>
          {config ? (
            <p>
              Free delivery on orders over {formatINR(config.freeShippingThresholdPaise)}; a flat {formatINR(config.flatShippingPaise)}{" "}
              applies below that.
              {config.codEnabled && " Cash on delivery is available, and our team confirms each COD order before it ships."}
            </p>
          ) : (
            <p>Delivery charges are shown at checkout.</p>
          )}
          <p>You can cancel within {config?.cancellationWindowHours ?? 12} hours of ordering from your account.</p>
        </div>
      </details>
      <details className={styles.item}>
        <summary>Returns and exchanges</summary>
        <div className={styles.content}>
          <p>
            Request a return, exchange for another size, or a refund within {config?.returnWindowDays ?? 14} days of delivery from your
            order page. Items should be unworn with tags attached.
          </p>
          <p>
            <a href="/return-policy">Read the full return policy</a>
          </p>
        </div>
      </details>
    </div>
  );
}
