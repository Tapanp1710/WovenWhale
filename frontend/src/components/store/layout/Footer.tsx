import Link from "next/link";
import type { Navigation } from "./nav";
import { NewsletterForm } from "./NewsletterForm";
import styles from "./Footer.module.css";

export function Footer({ nav }: { nav: Navigation }) {
  const year = new Date().getFullYear();
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <p className={styles.wordmark}>Woven Whale</p>
          <p className={styles.story}>
            Shirts and kurtas woven on handlooms by artisan families across India. Every piece carries the small irregularities of the loom.
          </p>
          <div className={styles.newsletter}>
            <h2 className={styles.heading}>New weaves, first</h2>
            <NewsletterForm />
          </div>
        </div>

        <nav aria-label="Footer" className={styles.columns}>
          <div>
            <h2 className={styles.heading}>Shop</h2>
            <ul>
              <li>
                <Link href="/shop">Shop all</Link>
              </li>
              {[...nav.primary, ...nav.weaves.slice(0, 4)].map((l) => (
                <li key={l.href}>
                  <Link href={l.href}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className={styles.heading}>Help</h2>
            <ul>
              <li>
                <Link href="/track-order">Track an order</Link>
              </li>
              <li>
                <Link href="/returns">Returns and exchanges</Link>
              </li>
              <li>
                <Link href="/shipping-policy">Shipping</Link>
              </li>
              <li>
                <Link href="/support">Support</Link>
              </li>
              <li>
                <Link href="/contact">Contact us</Link>
              </li>
            </ul>
          </div>
          <div>
            <h2 className={styles.heading}>WovenWhale</h2>
            <ul>
              <li>
                <Link href="/about">Our story</Link>
              </li>
              <li>
                <Link href="/account">Your account</Link>
              </li>
              <li>
                <Link href="/return-policy">Return policy</Link>
              </li>
              <li>
                <Link href="/privacy">Privacy</Link>
              </li>
              <li>
                <Link href="/terms">Terms</Link>
              </li>
            </ul>
          </div>
        </nav>
      </div>
      <div className={styles.base}>
        <p>© {year} WovenWhale. Handwoven in India.</p>
        <p>Secure payments. Cash on delivery available.</p>
      </div>
    </footer>
  );
}
