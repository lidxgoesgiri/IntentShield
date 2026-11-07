"use client";

import { useEffect, type RefObject } from "react";
import { MOTION_CONDITIONS } from "./motion-preferences";
import { setupRibbonMotion } from "./use-ribbon-scroll";

/**
 * Landing motion island (PRD §29). GSAP + ScrollTrigger are loaded lazily on
 * the client only, registered once, scoped to the landing root, and reverted
 * on unmount. With reduced motion nothing is created: the static, complete
 * presentation (all text visible, ribbons fully drawn) remains.
 */
export function useLandingMotion(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let cancelled = false;
    let revert: (() => void) | null = null;

    void (async () => {
      try {
        const [{ gsap }, { ScrollTrigger }] = await Promise.all([import("gsap"), import("gsap/ScrollTrigger")]);
        if (cancelled) return;
        gsap.registerPlugin(ScrollTrigger);

        const mm = gsap.matchMedia(root);
        mm.add({ motion: MOTION_CONDITIONS.motion, desktop: MOTION_CONDITIONS.desktop }, (context) => {
          const conditions = context.conditions as { motion?: boolean; desktop?: boolean } | undefined;
          if (!conditions?.motion) return;
          const desktop = Boolean(conditions.desktop);

          gsap.utils.toArray<HTMLElement>("[data-reveal]", root).forEach((element) => {
            gsap.from(element, {
              opacity: 0,
              y: desktop ? 20 : 12,
              duration: desktop ? 0.7 : 0.45,
              ease: "power2.out",
              scrollTrigger: { trigger: element, start: "top 88%", once: true },
            });
          });

          return setupRibbonMotion(gsap, root, desktop);
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
