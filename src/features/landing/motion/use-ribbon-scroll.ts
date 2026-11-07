import type { gsap as GsapType } from "gsap";

type Gsap = typeof GsapType;

function ribbonStrokes(root: HTMLElement, name: string): Element[] {
  return Array.from(root.querySelectorAll(`[data-ribbon="${name}"] [data-ribbon-path], [data-ribbon="${name}"] [data-ribbon-glow]`));
}

/**
 * Scroll-linked ribbon progress for S04 and draw-ins for S01/S08. Pure
 * presentation: it only animates stroke-dashoffset and a data-active
 * attribute on decorative SVG nodes — never content, state, or signing.
 */
export function setupRibbonMotion(gsap: Gsap, root: HTMLElement, desktop: boolean): () => void {
  const hero = ribbonStrokes(root, "hero");
  if (hero.length > 0) {
    gsap.fromTo(hero, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.4, delay: 0.25, ease: "power2.inOut" });
  }

  const howSection = root.querySelector<HTMLElement>("[data-how-section]");
  const howStrokes = ribbonStrokes(root, desktop ? "how-desktop" : "how-mobile");
  const nodes = Array.from(root.querySelectorAll<SVGElement>("[data-ribbon-node]"));
  if (howSection && howStrokes.length > 0) {
    nodes.forEach((node) => node.setAttribute("data-active", "false"));
    gsap.fromTo(
      howStrokes,
      { strokeDashoffset: 1 },
      {
        strokeDashoffset: 0,
        ease: "none",
        scrollTrigger: {
          trigger: howSection,
          start: "top 72%",
          end: "center 42%",
          scrub: 0.6,
          onUpdate: (self) => {
            nodes.forEach((node, index) => node.setAttribute("data-active", String(self.progress >= 0.12 + index * 0.4)));
          },
        },
      },
    );
  }

  const final = ribbonStrokes(root, "final");
  const finalSection = root.querySelector<HTMLElement>("#get-started");
  if (final.length > 0 && finalSection) {
    gsap.fromTo(
      final,
      { strokeDashoffset: 1 },
      { strokeDashoffset: 0, duration: 1.1, ease: "power2.out", scrollTrigger: { trigger: finalSection, start: "top 75%", once: true } },
    );
  }

  return () => {
    // Restore the static, fully-drawn presentation.
    nodes.forEach((node) => node.setAttribute("data-active", "true"));
  };
}
