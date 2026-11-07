"use client";

import { Pause, Play } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { InfiniteMarqueeTrack, type MarqueeTrackController } from "../rail/infinite-marquee-track";
import { RAIL_CAPABILITIES } from "../rail/rail-config";
import { TECH_MARKS } from "../rail/tech-marks";
import { useMotionRail } from "../rail/use-motion-rail";

/**
 * Interlude between How It Works and the product (not a numbered chapter):
 * the stack this build runs on, moving right → left, and the checks it
 * performs, moving left → right. Speed follows scroll velocity with damping;
 * a pause control stops all motion (WCAG 2.2.2). Static without JavaScript
 * and with reduced motion.
 */
export function TechnologyMotionRail() {
  const sectionRef = useRef<HTMLElement>(null);
  const controllersRef = useRef(new Set<MarqueeTrackController>());
  const upperRef = useRef<MarqueeTrackController | null>(null);
  const lowerRef = useRef<MarqueeTrackController | null>(null);
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [revision, setRevision] = useState(0);

  const sync = useCallback(() => {
    const next = new Set<MarqueeTrackController>();
    if (upperRef.current) next.add(upperRef.current);
    if (lowerRef.current) next.add(lowerRef.current);
    controllersRef.current = next;
    setRevision((value) => value + 1);
  }, []);
  const onUpper = useCallback(
    (controller: MarqueeTrackController | null) => {
      upperRef.current = controller;
      sync();
    },
    [sync],
  );
  const onLower = useCallback(
    (controller: MarqueeTrackController | null) => {
      lowerRef.current = controller;
      sync();
    },
    [sync],
  );

  useMotionRail(sectionRef, controllersRef, pausedRef, revision);

  const togglePaused = () => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  };

  return (
    <section
      ref={sectionRef}
      id="stack"
      aria-labelledby="stack-title"
      className="rail-section relative overflow-hidden border-t border-hairline"
      data-atmosphere="0.62"
    >
      <div aria-hidden className="landing-ambient rail-light absolute inset-0" />

      <div className="page-container relative pt-[clamp(72px,10vw,152px)]" data-rail-head="">
        <div className="flex items-center justify-between gap-6 border-b border-hairline/70 pb-4">
          <p className="type-eyebrow flex min-w-0 items-center gap-3 whitespace-nowrap">
            <span className="text-mint">Interlude</span>
            <span aria-hidden className="hidden h-px w-8 bg-hairline sm:block" />
            <span className="truncate">Stack &amp; capabilities</span>
          </p>
          <button
            type="button"
            onClick={togglePaused}
            aria-pressed={paused}
            aria-label={paused ? "Resume motion" : "Pause motion"}
            className="rail-pause inline-flex shrink-0 whitespace-nowrap min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-2 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-silver transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          >
            {paused ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
            <span>{paused ? "Resume" : "Pause"}</span>
            {/* The space lives inside the span so the visible label reads "Pause motion" (WCAG 2.5.3). */}
            <span className="hidden sm:inline">{" motion"}</span>
          </button>
        </div>

        <h2 id="stack-title" className="type-display rail-title mt-[clamp(28px,4vw,56px)]" data-split="flip">
          <span className="rail-title-line">Engineered</span>{" "}
          <span className="rail-title-line rail-title-offset-a">for every</span>{" "}
          <span className="rail-title-line rail-title-offset-b">signature.</span>
        </h2>

        <div className="mt-10 grid gap-6 lg:grid-cols-12" data-reveal="slide">
          <p className="type-meta lg:col-span-4">Built with · runs on every transfer</p>
          <p className="type-lead lg:col-span-6 lg:col-start-7">
            The stack this build actually runs on, and the checks it performs before any wallet prompt. Nothing listed here
            is a roadmap item or a partner.
          </p>
        </div>
      </div>

      <div className="rail-stage relative mt-[clamp(44px,6vw,88px)] pb-[clamp(80px,11vw,168px)]">
        <div className="rail-row rail-row-upper" data-rail-row="upper">
          <p className="rail-row-label type-meta page-container" aria-hidden>
            <span className="text-mint">01</span> — Built with
          </p>
          <InfiniteMarqueeTrack direction="left" speedKey="upperSpeed" label="Technologies this build uses" onController={onUpper}>
            {TECH_MARKS.map((mark) => (
              <li key={mark.id} className="rail-item rail-logo">
                <svg viewBox="0 0 24 24" className="rail-logo-mark" aria-hidden="true" focusable="false">
                  <path d={mark.path} fill="currentColor" />
                </svg>
                <span className="rail-logo-name">{mark.name}</span>
              </li>
            ))}
          </InfiniteMarqueeTrack>
        </div>

        <div className="rail-row rail-row-lower" data-rail-row="lower">
          <p className="rail-row-label type-meta page-container" aria-hidden>
            <span className="text-mint">02</span> — Every transfer runs
          </p>
          <InfiniteMarqueeTrack direction="right" speedKey="lowerSpeed" label="What IntentShield checks" onController={onLower}>
            {RAIL_CAPABILITIES.map((capability, index) => (
              <li key={capability} className="rail-item rail-word" data-tone={index % 2 === 0 ? "bright" : "quiet"}>
                <span className="rail-word-text">{capability}</span>
                <span aria-hidden className="rail-word-sep" />
              </li>
            ))}
          </InfiniteMarqueeTrack>
        </div>
      </div>
    </section>
  );
}
