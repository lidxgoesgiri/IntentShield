"use client";

import { useEffect, type RefObject } from "react";
import { setupBlockReveals, setupHeadlineReveals, setupHeroScroll, setupProductReveal, setupRailMotion } from "./cinematic-scroll";
import { MOTION_CONDITIONS } from "./motion-preferences";
import { setupRibbonMotion } from "./use-ribbon-scroll";

/**
 * Landing motion island (PRD §29). GSAP, ScrollTrigger and SplitText are
 * loaded lazily on the client only, registered once, scoped to the landing
 * root, and reverted on unmount. With reduced motion nothing is created: the
 * static, complete presentation (all text visible, ribbons fully drawn) stays.
 */
export function useLandingMotion(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let cancelled = false;
    let revert: (() => void) | null = null;

    void (async () => {
      try {
        const [{ gsap }, { ScrollTrigger }, { SplitText }] = await Promise.all([
          import("gsap"),
          import("gsap/ScrollTrigger"),
          import("gsap/SplitText"),
        ]);
        // Split headlines only after the display font is in, so line breaks are final.
        await document.fonts?.ready;
        if (cancelled) return;
        gsap.registerPlugin(ScrollTrigger, SplitText);

        const mm = gsap.matchMedia(root);
        mm.add({ motion: MOTION_CONDITIONS.motion, desktop: MOTION_CONDITIONS.desktop }, (context) => {
          const conditions = context.conditions as { motion?: boolean; desktop?: boolean } | undefined;
          if (!conditions?.motion) return;
          const desktop = Boolean(conditions.desktop);

          setupHeroScroll(gsap, root, desktop);
          const splits = setupHeadlineReveals(gsap, SplitText, root, desktop);
          setupBlockReveals(gsap, root, desktop);
          setupProductReveal(gsap, root, desktop);
          setupRailMotion(gsap, root, desktop);
          const restoreRibbon = setupRibbonMotion(gsap, root, desktop);

          return () => {
            splits.forEach((split) => split.revert());
            restoreRibbon();
          };
        });

        revert = () => mm.revert();
      } catch {
        // Motion is progressive enhancement: failure leaves the static page intact.
      }
    })();

    return () => {
      cancelled = true;
      revert?.();
    };
  }, [rootRef]);
}
