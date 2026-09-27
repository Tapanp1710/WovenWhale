import type { Metadata } from "next";
import { ContentPage } from "@/components/store/content/ContentPage";
import { ButtonLink } from "@/components/ui/ButtonLink";

export const metadata: Metadata = {
  title: "Our story",
  description: "WovenWhale makes handwoven shirts and kurtas with Indian handloom weavers.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <ContentPage
      title="Made slowly, on purpose"
      lede="WovenWhale turns traditional Indian handloom textiles into shirts and kurtas cut for everyday wear."
    >
      <h2>Why handloom</h2>
      <p>
        A handloom is operated by a person, not a motor. That makes the cloth slower to produce, and it gives it a texture and life that
        machine-woven fabric doesn&apos;t have. Small shifts in colour or weave are signs of that process, not flaws.
      </p>
      <h2>The techniques</h2>
      <p>
        Much of our collection is built on three techniques. In <strong>ikat</strong>, the threads are resist-dyed before weaving, which
        gives the pattern its soft, feathered edge. In <strong>jamdani</strong>, motifs are inlaid by hand as the cloth is woven.{" "}
        <strong>Kalamkari</strong> patterns are drawn or block-printed onto cotton.
      </p>
      <h2>How we make it</h2>
      <p>
        We choose fabrics we love, cut them into shirts and kurtas designed to be worn often, and produce in small runs. When a weave sells
        out, the next batch may look a little different, because it came off a different loom.
      </p>
      <h2>Caring for handwoven cotton</h2>
      <p>Hand wash separately in cold water with a mild detergent, don&apos;t bleach, and dry in shade. It softens with every wash.</p>
      <p>
        <ButtonLink href="/shop">Explore the collection</ButtonLink>
      </p>
    </ContentPage>
  );
}
