import type { gsap as GsapType } from "gsap";
import type { SplitText as SplitTextType } from "gsap/SplitText";

type Gsap = typeof GsapType;
type SplitTextClass = typeof SplitTextType;

/**
 * Cinematic scroll choreography for the landing page (presentation only).
 * Every effect animates decorative transforms/opacity of server-rendered
 * content; none of it creates, hides or changes text permanently, and all of
 * it is reverted by the caller's gsap.matchMedia context. Reduced motion never
 * reaches this module.
 */

/** S01: the headline lines drift apart, the visual tilts back, the copy recedes. */
export function setupHeroScroll(gsap: Gsap, root: HTMLElement, desktop: boolean): void {
  const hero = root.querySelector<HTMLElement>("#hero");
  if (!hero) return;
  const [first, second] = Array.from(hero.querySelectorAll<HTMLElement>("[data-hero-line]"));
  const visual = hero.querySelector<HTMLElement>(desktop ? ".hero-visual" : "[data-hero-visual]");
  const copy = hero.querySelector<HTMLElement>("[data-hero-copy]");
  const meta = hero.querySelector<HTMLElement>("[data-hero-meta]");

  const timeline = gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: desktop ? 0.7 : 0.4 },
  });
  if (first) timeline.to(first, { xPercent: desktop ? -9 : -4 }, 0);
  if (second) timeline.to(second, { xPercent: desktop ? 6 : 3 }, 0);
  if (meta) timeline.to(meta, { opacity: 0, y: -20 }, 0);
  if (copy) timeline.to(copy, { y: desktop ? -60 : -24 }, 0.05);
  if (visual) {
    timeline.to(
      visual,
      desktop
        ? { yPercent: 10, rotateX: 11, scale: 0.93, transformPerspective: 1400, transformOrigin: "50% 0%" }
        : { y: 40 },
      0,
    );
  }
}

type SplitVariant = "lines" | "words" | "chars" | "scrub" | "flip";

/**
 * Section headlines: masked SplitText reveals, deliberately varied per section
 * (lines, words, characters, or scroll-synchronised). SplitText keeps an
 * aria-label on the heading, so assistive tech reads the original text.
 */
export function setupHeadlineReveals(gsap: Gsap, SplitText: SplitTextClass, root: HTMLElement, desktop: boolean): Array<{ revert: () => void }> {
  const splits: Array<{ revert: () => void }> = [];
  root.querySelectorAll<HTMLElement>("[data-split]").forEach((heading) => {
    const variant = (heading.dataset.split as SplitVariant) || "lines";
    const type = variant === "chars" ? "words,chars" : variant === "words" ? "words" : "lines";
    const split = SplitText.create(heading, {
      type,
      mask: variant === "chars" ? "words" : variant === "words" ? "words" : "lines",
      autoSplit: true,
      onSplit(self) {
        const trigger = { trigger: heading, start: "top 86%", once: true };
        if (variant === "words") {
          return gsap.from(self.words, { yPercent: 105, rotate: 3, duration: 0.95, ease: "expo.out", stagger: 0.045, scrollTrigger: trigger });
        }
        if (variant === "chars") {
          return gsap.from(self.chars, { yPercent: 110, opacity: 0, duration: 0.8, ease: "power4.out", stagger: { each: 0.016, from: "start" }, scrollTrigger: trigger });
        }
        if (variant === "flip") {
          return gsap.from(self.lines, {
            yPercent: 105,
            rotateX: -58,
            transformPerspective: 900,
            transformOrigin: "50% 100%",
            duration: 1.25,
            ease: "expo.out",
            stagger: 0.13,
            scrollTrigger: trigger,
          });
        }
        if (variant === "scrub") {
          return gsap.fromTo(
            self.lines,
            { yPercent: 100, xPercent: (index: number) => (index % 2 === 0 ? -4 : 4) },
            {
              yPercent: 0,
              xPercent: 0,
              ease: "none",
              stagger: 0.12,
              scrollTrigger: { trigger: heading, start: "top 92%", end: desktop ? "top 52%" : "top 62%", scrub: 0.6 },
            },
          );
        }
        return gsap.from(self.lines, { yPercent: 108, duration: 1.05, ease: "expo.out", stagger: 0.11, scrollTrigger: trigger });
      },
    });
    splits.push(split);
  });
  return splits;
}

/** Block reveals with distinct characters instead of one fade-up everywhere. */
export function setupBlockReveals(gsap: Gsap, root: HTMLElement, desktop: boolean): void {
  root.querySelectorAll<HTMLElement>("[data-reveal]").forEach((element) => {
    const variant = element.dataset.reveal || "rise";
    const scrollTrigger = { trigger: element, start: "top 88%", once: true };
    switch (variant) {
      case "clip":
        gsap.fromTo(
          element,
          { clipPath: "inset(0% 0% 100% 0%)" },
          { clipPath: "inset(0% 0% 0% 0%)", duration: 1.1, ease: "expo.out", clearProps: "clipPath", scrollTrigger },
        );
        break;
      case "slide":
        gsap.from(element, { x: desktop ? -36 : -16, opacity: 0, duration: 0.9, ease: "power3.out", scrollTrigger });
        break;
      case "stagger":
        gsap.from(Array.from(element.children), { y: 22, opacity: 0, duration: 0.7, ease: "power3.out", stagger: 0.08, scrollTrigger });
        break;
      case "line":
        gsap.fromTo(element, { scaleX: 0, transformOrigin: "0% 50%" }, { scaleX: 1, duration: 1.2, ease: "expo.inOut", scrollTrigger });
        break;
      default:
        gsap.from(element, { y: desktop ? 26 : 14, opacity: 0, duration: desktop ? 0.85 : 0.5, ease: "power3.out", scrollTrigger });
    }
  });
}

/** S05: the product frame rises out of perspective as it enters. */
export function setupProductReveal(gsap: Gsap, root: HTMLElement, desktop: boolean): void {
  const frame = root.querySelector<HTMLElement>("[data-product-frame]");
  if (!frame) return;
  if (!desktop) {
    gsap.from(frame, { y: 30, opacity: 0, duration: 0.7, ease: "power3.out", scrollTrigger: { trigger: frame, start: "top 90%", once: true } });
    return;
  }
  gsap.fromTo(
    frame,
    // Transform only — never partial opacity, so every label keeps its contrast while it moves.
    { rotateX: 16, yPercent: 8, scale: 0.9, transformPerspective: 1700, transformOrigin: "50% 100%" },
    { rotateX: 0, yPercent: 0, scale: 1, ease: "none", scrollTrigger: { trigger: frame, start: "top 98%", end: "top 30%", scrub: 0.8 } },
  );
}

/**
 * Stack interlude: the two rails enter from opposite sides behind a clip
 * reveal, then the headline recedes and the band dims as the product section
 * takes over. Only the row wrappers and the heading block are animated here —
 * the strips inside are moved by the rail's own loop, so no transform is
 * driven by two engines.
 */
export function setupRailMotion(gsap: Gsap, root: HTMLElement, desktop: boolean): void {
  const section = root.querySelector<HTMLElement>("#stack");
  if (!section) return;
  const upper = section.querySelector<HTMLElement>('[data-rail-row="upper"]');
  const lower = section.querySelector<HTMLElement>('[data-rail-row="lower"]');
  const head = section.querySelector<HTMLElement>("[data-rail-head]");
  const shift = desktop ? 9 : 5;

  const enter = gsap.timeline({ scrollTrigger: { trigger: section, start: "top 78%", once: true } });
  if (upper) {
    enter.fromTo(
      upper,
      { xPercent: shift, clipPath: "inset(0% 0% 0% 100%)" },
      { xPercent: 0, clipPath: "inset(0% 0% 0% 0%)", duration: 1.35, ease: "expo.out", clearProps: "clipPath" },
      0.2,
    );
  }
  if (lower) {
    enter.fromTo(
      lower,
      { xPercent: -shift, clipPath: "inset(0% 100% 0% 0%)" },
      { xPercent: 0, clipPath: "inset(0% 0% 0% 0%)", duration: 1.35, ease: "expo.out", clearProps: "clipPath" },
      0.38,
    );
  }

  const exit = gsap.timeline({
    defaults: { ease: "none" },
    // Starts only once the product section owns the lower half of the screen.
    scrollTrigger: { trigger: section, start: "bottom 55%", end: "bottom top", scrub: 0.6 },
  });
  if (head) exit.to(head, { yPercent: desktop ? -12 : -6, scale: desktop ? 0.94 : 0.97, transformOrigin: "0% 0%" }, 0);
  const rows = [upper, lower].filter((row): row is HTMLElement => Boolean(row));
  if (rows.length > 0) exit.to(rows, { opacity: 0.5 }, 0.2);
}
