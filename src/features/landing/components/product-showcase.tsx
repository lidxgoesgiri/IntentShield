import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { BrandMark } from "@/components/layout/brand-mark";
import { Button } from "@/components/ui/button";
import { runLabScenario } from "@/features/demo/lib/scenarios";
import { PRODUCT_COPY } from "../config/section-copy";
import { ProductShowcaseTabs } from "./product-showcase-tabs";
import { SectionHeader } from "./section-header";

/**
 * S05 — Product Showcase (PRD §10.1). One large product frame rendered with the
 * REAL IntentShield components; verdicts are computed at render time by the
 * production verifier from controlled samples (not screenshots, not fiction).
 */
export function ProductShowcase() {
  const blocked = runLabScenario("changed-recipient", 0);
  const matched = runLabScenario("exact-match", 0);

  return (
    <section id="product" data-atmosphere="0.28" aria-labelledby="product-title" className="border-t border-hairline">
      <div className="page-container py-[clamp(64px,11vw,168px)]">
        <SectionHeader index="05" eyebrow="Product" title={PRODUCT_COPY.title} titleId="product-title" lead={PRODUCT_COPY.lead} split="scrub">
          <Button asChild>
            <Link href="/app">
              Launch App <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </SectionHeader>

        <figure className="mt-14 lg:mt-20">
          <div className="product-frame overflow-hidden rounded-[22px] border border-hairline bg-carbon shadow-[0_40px_120px_-60px_rgb(100_232_199/0.25)]" data-product-frame="">
            <div className="flex items-center gap-3 border-b border-hairline bg-obsidian/70 px-4 py-3 sm:px-6">
              <BrandMark className="size-6" />
              <span className="font-heading text-[0.95rem] font-medium text-white">IntentShield</span>
              <span className="type-caption hidden sm:inline">/ workspace preview</span>
            </div>
            <ProductShowcaseTabs
              data={{
                intent: { sender: blocked.intent.sender, recipient: blocked.intent.recipient, amountLamports: blocked.intent.amountLamports },
                blocked: { result: blocked.result, messageBytes: blocked.messageBytes },
                matched: { result: matched.result },
              }}
            />
          </div>
          <figcaption className="type-caption mt-4 max-w-3xl">
            Live preview: these are the production components, rendered with SHA-256-derived sample addresses. The verdicts are
            computed by the real verifier from controlled, unsigned sample messages — no wallet balances, hashes, or audit stamps
            are invented.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
