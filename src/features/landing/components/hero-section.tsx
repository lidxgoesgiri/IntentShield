import { ArrowRight, ArrowDown } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { HERO_COPY } from "../config/section-copy";
import { RibbonSegment } from "../visuals/ribbon-segment";
import { SampleCheckCard, SampleIntentCard } from "../visuals/transaction-illustration";
import { HeroSecurityCore } from "./hero-security-core";

/** Ribbon from the sample intent, through the core, into the sample check (600×500 space). */
const HERO_RIBBON =
  "M288 96 C338 96 326 168 348 214 C366 250 398 262 430 266 C486 273 500 300 486 334";

/** S01 — Hero: "Know what you sign." (PRD §10.1). Server-rendered; H1 visible before hydration. */
export function HeroSection() {
  return (
    <section id="hero" aria-labelledby="hero-title" className="relative overflow-hidden">
      <div aria-hidden className="landing-ambient landing-hero-paint absolute inset-0" />
      <div aria-hidden className="landing-ambient landing-grid-lines absolute inset-0 opacity-40" />

      <div className="page-container relative grid items-center gap-12 pb-20 pt-12 sm:pt-16 lg:min-h-[calc(100svh-72px)] lg:grid-cols-12 lg:gap-6 lg:pb-24 lg:pt-16">
        <div className="space-y-8 lg:col-span-5">
          <p className="type-eyebrow">{HERO_COPY.eyebrow}</p>
          <h1 id="hero-title" className="type-h1 lg:text-[clamp(3.5rem,6.8vw,7.4rem)]">
            <span className="block whitespace-nowrap">{HERO_COPY.title[0]}</span>
            <span className="block whitespace-nowrap">{HERO_COPY.title[1]}</span>
          </h1>
          <p className="font-display text-[clamp(1.2rem,1.9vw,1.6rem)] font-medium leading-snug tracking-[-0.01em] text-white/90">
            {HERO_COPY.subtitle}
          </p>
          <p className="type-lead">{HERO_COPY.body}</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button asChild size="lg">
              <Link href="/app">
                {HERO_COPY.primaryCta} <ArrowRight className="size-5" aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <a href="#simulator">
                {HERO_COPY.secondaryCta} <ArrowDown className="size-5" aria-hidden />
              </a>
            </Button>
          </div>
          <ul className="flex flex-wrap gap-2" aria-label="What IntentShield is">
            {HERO_COPY.trust.map((item) => (
              <li key={item.label}>
                <Tooltip content={item.detail}>
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-hairline bg-carbon/70 px-3.5 text-[0.85rem] text-silver transition-colors hover:border-silver/40 hover:text-white"
                    aria-label={`${item.label}: ${item.detail}`}
                  >
                    <span aria-hidden className="size-1.5 rounded-full bg-mint" />
                    {item.label}
                  </button>
                </Tooltip>
              </li>
            ))}
          </ul>
        </div>

        {/* Visual: 55–60% on desktop; stacked core → samples on mobile. */}
        <div className="lg:col-span-7">
          <div className="relative hidden aspect-[6/5] w-full lg:block">
            <div className="absolute inset-y-0 left-[16%] right-[-4%]">
              <HeroSecurityCore />
            </div>
            <RibbonSegment name="hero" d={HERO_RIBBON} viewBox="0 0 600 500" className="absolute inset-0 h-full w-full" strokeWidth={2} />
            <SampleIntentCard className="absolute left-[4%] top-[5%] w-[44%]" />
            <SampleCheckCard className="absolute bottom-[3%] right-0 w-[47%]" />
            <p className="type-caption absolute bottom-[3%] left-0 max-w-[40%] font-mono text-[0.72rem] uppercase tracking-[0.1em]">
              Demo / sample data — fixtures, not network results
            </p>
          </div>

          <div className="space-y-5 lg:hidden">
            <div className="mx-auto aspect-square w-full max-w-[420px]">
              <HeroSecurityCore />
            </div>
            <SampleIntentCard />
            <SampleCheckCard />
            <p className="type-caption font-mono text-[0.72rem] uppercase tracking-[0.1em]">
              Demo / sample data — fixtures, not network results
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
