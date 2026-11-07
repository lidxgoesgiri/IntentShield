/**
 * Motion rail tuning. Speeds are in CSS pixels per second, so the visual pace
 * is the same on every viewport width. Scroll response adds a bounded boost on
 * top of the base speed; it never reverses a track's direction.
 */
export type RailDirection = "left" | "right";

export type RailProfile = Readonly<{
  /** Base speed of the upper (technology) track, px/s. */
  upperSpeed: number;
  /** Base speed of the lower (capability) track, px/s. */
  lowerSpeed: number;
  /** Upper bound of the speed multiplier while scrolling (1 = no boost). */
  maxMultiplier: number;
  /** Extra multiplier per 1,000 px/s of scroll velocity. */
  scrollSensitivity: number;
  /** Speed factor while a pointer rests on a track (hover-capable devices only). */
  hoverFactor: number;
  /** Damping rates (1/s): how quickly speed rises toward / falls back to its target. */
  accelerate: number;
  decelerate: number;
}>;

export const RAIL_PROFILES = {
  desktop: {
    upperSpeed: 46,
    lowerSpeed: 64,
    maxMultiplier: 4,
    scrollSensitivity: 1.1,
    hoverFactor: 0.28,
    accelerate: 7,
    decelerate: 2.4,
  },
  tablet: {
    upperSpeed: 40,
    lowerSpeed: 54,
    maxMultiplier: 3,
    scrollSensitivity: 0.8,
    hoverFactor: 0.35,
    accelerate: 6,
    decelerate: 2.4,
  },
  mobile: {
    upperSpeed: 30,
    lowerSpeed: 38,
    maxMultiplier: 2,
    scrollSensitivity: 0.45,
    hoverFactor: 1,
    accelerate: 5,
    decelerate: 2.2,
  },
} as const satisfies Record<string, RailProfile>;

export type RailProfileName = keyof typeof RAIL_PROFILES;

export function railProfileForWidth(width: number): RailProfileName {
  if (width >= 1024) return "desktop";
  if (width >= 768) return "tablet";
  return "mobile";
}

/** The real capabilities of this build, in the words the app itself uses. */
export const RAIL_CAPABILITIES = [
  "Simulation",
  "Verification",
  "AI Explanation",
  "Devnet",
  "Transaction Inspection",
  "Intent Matching",
] as const;
