"use client";

import type { SearchSuggestion } from "@wovenwhale/backend/contracts";
import { Clock, Search, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { api } from "@/lib/api/client";
import { formatINR } from "@/lib/format";
import { recentSearches } from "@/lib/track";
import styles from "./SearchPanel.module.css";

const POPULAR = ["Ikat", "Jamdani", "Kalamkari", "Linen", "Kurta", "Mandarin collar"];

export function SearchPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchSuggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    if (open) setRecent(recentSearches.list());
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      api<SearchSuggestion>(`/catalog/search/suggest?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then(setResults)
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }, 180);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q]);

  function go(term: string) {
    const clean = term.trim();
    if (!clean) return;
    recentSearches.add(clean);
    onOpenChange(false);
    router.push(`/search?q=${encodeURIComponent(clean)}`);
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    go(q);
  };

  const empty = results && results.products.length === 0 && results.categories.length === 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Search" hideTitle side="right" width="min(560px, 100vw)">
      <form role="search" onSubmit={submit} className={styles.form}>
        <Search size={20} aria-hidden="true" className={styles.glass} />
        <label htmlFor="site-search" className="visually-hidden">
          Search products
        </label>
        <input
          id="site-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search ikat, jamdani, kurtas…"
          autoComplete="off"
          autoFocus
          enterKeyHint="search"
          aria-controls="search-results"
        />
        {q && (
          <button type="button" className={styles.clear} onClick={() => setQ("")} aria-label="Clear search">
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </form>

      <div id="search-results" aria-live="polite" aria-busy={loading} className={styles.results}>
        {!results && (
          <>
            {recent.length > 0 && (
              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <h2>Recent searches</h2>
                  <button
                    type="button"
                    onClick={() => {
                      recentSearches.clear();
                      setRecent([]);
                    }}
                  >
                    Clear
                  </button>
                </div>
                <ul className={styles.chips}>
                  {recent.map((r) => (
                    <li key={r}>
                      <button type="button" onClick={() => go(r)}>
                        <Clock size={14} aria-hidden="true" /> {r}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className={styles.section}>
              <h2>Popular</h2>
              <ul className={styles.chips}>
                {POPULAR.map((p) => (
                  <li key={p}>
                    <button type="button" onClick={() => go(p)}>
                      {p}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        {empty && <p className={styles.none}>Nothing matches “{q.trim()}”. Try a weave like ikat or jamdani, or a colour.</p>}

        {results && results.categories.length > 0 && (
          <section className={styles.section}>
            <h2>Collections</h2>
            <ul className={styles.chips}>
              {results.categories.map((c) => (
                <li key={c.slug}>
                  <Link href={`/shop/${c.slug}`} onClick={() => onOpenChange(false)}>
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {results && results.products.length > 0 && (
          <section className={styles.section}>
            <h2>Products</h2>
            <ul className={styles.products}>
              {results.products.map((p) => (
                <li key={p.slug}>
                  <Link href={`/product/${p.slug}`} onClick={() => onOpenChange(false)} className={styles.product}>
                    <span className={styles.thumb}>{p.imageUrl && <Image src={p.imageUrl} alt="" fill sizes="56px" />}</span>
                    <span className={styles.productName}>{p.name}</span>
                    <span className={styles.productPrice}>{formatINR(p.pricePaise)}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <button type="button" className={styles.all} onClick={() => go(q)}>
              See all results for “{q.trim()}”
            </button>
          </section>
        )}
      </div>
    </Sheet>
  );
}
