/** Media conditions shared by the landing motion island (PRD §29.1). */
export const MOTION_CONDITIONS = {
  motion: "(prefers-reduced-motion: no-preference)",
  reduced: "(prefers-reduced-motion: reduce)",
  desktop: "(min-width: 1024px)",
} as const;

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia(MOTION_CONDITIONS.reduced).matches;
}
