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
export function useLandingMotion(rootRef: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // Reduced motion and user pause keep SSR content complete and load no optional GSAP code.
    if (!enabled) return;
    let cancelled = false;
    let revert: (() => void) | null = null;

    // Smooth scrolling stays off until the page has settled (see globals.css): a smooth
    // initial #hash jump keeps animating past every re-alignment below.
    document.documentElement.removeAttribute("data-smooth-scroll");

    // Pinning and ScrollTrigger refreshes change the page height after the browser
    // has already jumped to a #hash (on load or from a quick nav click). Remember
    // that, and whether the visitor scrolled by hand, to re-align afterwards.
    let hashNavigated = Boolean(window.location.hash);
    let userScrolled = false;
    const onHashChange = () => {
      hashNavigated = true;
    };
    const onUserScroll = () => {
      userScrolled = true;
    };
    const onKey = (event: KeyboardEvent) => {
      if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) userScrolled = true;
    };
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("wheel", onUserScroll, { passive: true });
    window.addEventListener("touchmove", onUserScroll, { passive: true });
    window.addEventListener("keydown", onKey);
    let stopRealigning: (() => void) | null = null;
    const stopWatching = () => {
      document.documentElement.setAttribute("data-smooth-scroll", "");
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("wheel", onUserScroll);
      window.removeEventListener("touchmove", onUserScroll);
      window.removeEventListener("keydown", onKey);
      stopRealigning?.();
      stopRealigning = null;
    };

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

        // Every refresh in the settling period (fonts, load event, pin spacers) can move
        // the hash target; follow it until the visitor scrolls or the page has settled.
        const realign = () => {
          if (!hashNavigated || userScrolled || !window.location.hash) return;
          let id = window.location.hash.slice(1);
          try {
            id = decodeURIComponent(id);
          } catch {
            // A malformed escape in the URL: look the raw fragment up instead.
          }
          document.getElementById(id)?.scrollIntoView({ behavior: "instant", block: "start" });
        };
        ScrollTrigger.addEventListener("refresh", realign);
        const settle = window.setTimeout(() => stopWatching(), 4000);
        stopRealigning = () => {
          window.clearTimeout(settle);
          ScrollTrigger.removeEventListener("refresh", realign);
        };
        ScrollTrigger.refresh();
        realign();
      } catch {
        // Motion is progressive enhancement: failure leaves the static page intact.
      }
    })();

    return () => {
      cancelled = true;
      stopWatching();
      revert?.();
    };
  }, [rootRef, enabled]);
}
