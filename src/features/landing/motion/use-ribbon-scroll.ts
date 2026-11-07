import type { gsap as GsapType } from "gsap";

type Gsap = typeof GsapType;

function ribbonStrokes(root: HTMLElement, name: string): Element[] {
  return Array.from(root.querySelectorAll(`[data-ribbon="${name}"] [data-ribbon-path], [data-ribbon="${name}"] [data-ribbon-glow]`));
}

/**
 * Scroll-linked ribbon for S04 and the S08 underline. Pure presentation: it
 * only animates stroke-dashoffset, opacity/transform of the step blocks and a
 * data-active attribute on decorative SVG nodes — never content, state, or
 * signing. The ribbon follows natural scrolling without pin spacers, and
 * each stage comes into focus as the ribbon reaches it.
 */
export function setupRibbonMotion(gsap: Gsap, root: HTMLElement, desktop: boolean): () => void {
  const howSection = root.querySelector<HTMLElement>("[data-how-section]");
  const howStrokes = ribbonStrokes(root, desktop ? "how-desktop" : "how-mobile");
  const nodes = Array.from(root.querySelectorAll<SVGElement>("[data-ribbon-node]"));
  const steps = Array.from(root.querySelectorAll<HTMLElement>("[data-how-step]"));
  const stage = root.querySelector<HTMLElement>("[data-how-pin]");

  const markProgress = (progress: number) => {
    nodes.forEach((node, index) => node.setAttribute("data-active", String(progress >= 0.1 + index * 0.36)));
    steps.forEach((step, index) => step.setAttribute("data-active", String(progress >= 0.06 + index * 0.33)));
  };

  if (howSection && howStrokes.length > 0) {
    markProgress(0);
    if (desktop && stage) {
      const timeline = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: stage,
          start: "top 82%",
          end: "bottom 38%",
          scrub: 0.6,
          onUpdate: (self) => markProgress(self.progress),
        },
      });
      timeline.fromTo(howStrokes, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1 }, 0);
      steps.forEach((step, index) => {
        // Motion only: legibility comes from the data-active colour state, which stays AA-compliant.
        timeline.fromTo(step, { y: 28 }, { y: 0, duration: 0.22, ease: "power2.out" }, 0.04 + index * 0.33);
      });
    } else {
      gsap.fromTo(
        howStrokes,
        { strokeDashoffset: 1 },
        {
          strokeDashoffset: 0,
          ease: "none",
          scrollTrigger: {
            trigger: howSection,
            start: "top 72%",
            end: "bottom 60%",
            scrub: 0.6,
            onUpdate: (self) => markProgress(self.progress),
          },
        },
      );
    }
  }

  const final = ribbonStrokes(root, "final");
  const finalSection = root.querySelector<HTMLElement>("#get-started");
  if (final.length > 0 && finalSection) {
    gsap.fromTo(
      final,
      { strokeDashoffset: 1 },
      { strokeDashoffset: 0, duration: 1.3, ease: "power2.out", scrollTrigger: { trigger: finalSection, start: "top 70%", once: true } },
    );
  }

  return () => {
    // Restore the static, fully-drawn presentation.
    nodes.forEach((node) => node.setAttribute("data-active", "true"));
    steps.forEach((step) => step.setAttribute("data-active", "true"));
  };
}
