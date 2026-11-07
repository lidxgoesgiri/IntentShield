import { ArrowRight, FlaskConical } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FINAL_COPY } from "../config/section-copy";
import { RibbonSegment } from "../visuals/ribbon-segment";

/** S08 — Final CTA: "Understand first. Sign second." (PRD §10.1). */
export function FinalCTASection() {
  return (
    <section id="get-started" aria-labelledby="final-title" className="relative overflow-hidden border-t border-hairline" data-atmosphere="0.8">
      <div aria-hidden className="landing-ambient landing-hero-paint absolute inset-0 opacity-70" />
      <div className="page-container relative py-[clamp(80px,13vw,200px)]">
        <p className="type-eyebrow flex items-center gap-3">
          <span className="text-mint">08</span>
          <span aria-hidden className="h-px w-10 bg-hairline" />
          <span>Get started</span>
        </p>
        <h2 id="final-title" className="type-display mt-10 max-w-[12ch] text-[clamp(2.4rem,9vw,8.5rem)] leading-[0.88]">
          <span className="block" data-reveal="clip">
            {FINAL_COPY.title[0]}
          </span>{" "}
          <span className="relative inline-block" data-reveal="clip">
            {FINAL_COPY.title[1]}
            <RibbonSegment
              name="final"
              d="M4 18 C120 4 260 26 420 14 C520 7 600 12 660 10"
              viewBox="0 0 664 28"
              preserveAspectRatio="none"
              className="ribbon-terminal absolute -bottom-3 left-0 h-5 w-full"
              strokeWidth={2.4}
            />
          </span>
        </h2>
        <div className="mt-14 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Button asChild size="lg">
            <Link href="/app">
              Launch IntentShield <ArrowRight className="size-5" aria-hidden />
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <a href="#simulator">
              <FlaskConical className="size-5" aria-hidden /> Run Demo
            </a>
          </Button>
        </div>
        <p className="type-caption mt-4">“Run Demo” opens the controlled simulator above — no wallet, no funds. “Launch” opens the real Devnet app.</p>
        <div className="mt-12 space-y-2 border-t border-hairline pt-8">
          <p className="font-mono text-[0.85rem] uppercase tracking-[0.12em] text-white">{FINAL_COPY.sub}</p>
          <p className="max-w-2xl text-silver">{FINAL_COPY.caveat}</p>
        </div>
      </div>
    </section>
  );
}
