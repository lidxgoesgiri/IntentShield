import { ArrowDown, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { HISTORICAL_DEVNET_PROOF } from "@/config/proof";
import { HERO_COPY } from "../config/section-copy";
import { SampleCheckCard, SampleIntentCard } from "../visuals/transaction-illustration";
import { SignatureRibbon } from "../visuals/signature-ribbon";
import { HeroSecurityCore } from "./hero-security-core";

/**
 * S01 — Hero: "Know what you sign." (PRD §10.1). Server-rendered; the H1 is
 * real text, visible before hydration and without JavaScript. Its line reveal
 * is CSS only and is skipped for reduced motion.
 */
export function HeroSection() {
  return (
    <section id="hero" aria-labelledby="hero-title" className="hero-stage relative overflow-hidden" data-atmosphere="1">
      <div aria-hidden className="landing-ambient hero-atmosphere absolute inset-0" />
      <div aria-hidden className="landing-ambient landing-grid-lines absolute inset-0 opacity-30" />
      <SignatureRibbon variant="hero" className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block" />

      <div className="page-container relative z-10 pb-[clamp(40px,6vw,88px)] pt-[clamp(20px,4vh,44px)]">
        <div className="flex items-center justify-between gap-6 border-b border-hairline/70 pb-4" data-hero-meta="">
          <p className="type-eyebrow flex items-center gap-3">
            <span className="text-mint">01</span>
            <span aria-hidden className="h-px w-8 bg-hairline" />
            <span>{HERO_COPY.eyebrow}</span>
          </p>
          <p className="type-meta hidden md:block">Pre-signature verification · deterministic</p>
        </div>

        <h1 id="hero-title" className="type-display hero-title mt-[clamp(22px,4.5vh,56px)]">
          <span className="hero-line" data-hero-line="0">
            <span className="hero-line-inner" style={{ ["--i" as string]: 0 }}>
              {HERO_COPY.title[0]}
            </span>
          </span>{" "}
          <span className="hero-line hero-line-offset" data-hero-line="1">
            <span className="hero-line-inner" style={{ ["--i" as string]: 1 }}>
              {HERO_COPY.title[1]}
            </span>
          </span>
        </h1>

        <div className="mt-[clamp(28px,4vw,56px)] grid gap-8 lg:grid-cols-12 lg:gap-8">
          <div className="hero-copy space-y-6 lg:col-span-5" data-hero-copy="">
            <p className="font-heading text-[clamp(1.35rem,2.1vw,1.95rem)] font-semibold leading-[1.15] tracking-[-0.02em] text-white">
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
            <Link href={`/tx/${HISTORICAL_DEVNET_PROOF.signature}`} className="inline-flex min-h-11 flex-wrap items-center gap-x-2 text-sm text-silver underline decoration-mint/50 underline-offset-4 hover:text-white">
              <span className="text-mint">On-chain proof</span><span>0.01 SOL · historical Devnet transfer</span>
            </Link>
            <div className="hero-trust-frame border-t border-hairline/80">
              <ul className="hero-trust" aria-label="What IntentShield is">
                {HERO_COPY.trust.map((item) => (
                  <li key={item.label} className="hero-trust-item border-b border-hairline/80 sm:border-b-0">
                    <Tooltip content={item.detail}>
                      <button
                        type="button"
                        className="group flex min-h-14 w-full items-center gap-3 whitespace-nowrap py-3 text-left"
                        aria-label={`${item.label}: ${item.detail}`}
                      >
                        <span aria-hidden className="hero-trust-mark h-px w-4 shrink-0 bg-mint" />
                        <span className="hero-trust-label text-[0.9rem] text-silver underline decoration-hairline decoration-dotted underline-offset-[5px] transition-colors group-hover:text-white group-hover:decoration-mint/70">
                          {item.label}
                        </span>
                      </button>
                    </Tooltip>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Visual: core + labeled demo samples. */}
          <div className="lg:col-span-7" data-hero-visual="">
            <div className="hero-visual relative hidden aspect-[6/5] w-full lg:block">
              <div className="absolute inset-y-0 left-[18%] right-[-6%]">
                <HeroSecurityCore />
              </div>
              <SampleIntentCard className="absolute left-[2%] top-[4%] w-[44%]" />
              <SampleCheckCard className="absolute bottom-[4%] right-0 w-[47%]" />
              <p className="type-meta absolute bottom-[4%] left-0 max-w-[38%] leading-relaxed">
                Demo / sample data — fixtures, not network results
              </p>
            </div>

            <div className="space-y-5 lg:hidden">
              <div className="relative mx-auto aspect-square w-full max-w-[240px] sm:max-w-[300px]">
                <HeroSecurityCore />
                <SignatureRibbon variant="compact" className="pointer-events-none absolute inset-0 h-full w-full" />
              </div>
              <SampleIntentCard />
              <SampleCheckCard />
              <p className="type-meta leading-relaxed">Demo / sample data — fixtures, not network results</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
