import type { RailDirection, RailProfile } from "./rail-config";

/**
 * Pure maths for the infinite motion rail (no DOM).
 *
 * Each track moves one strip of identical copies. Its offset lives in
 * [-sequenceWidth, 0): moving left it decreases, moving right it increases,
 * and it wraps by exactly one sequence width, which is visually identical —
 * so the loop never jumps, whatever the speed or frame time.
 */

/** Wrap an offset into [-sequenceWidth, 0). */
export function wrapOffset(offset: number, sequenceWidth: number): number {
  if (!(sequenceWidth > 0) || !Number.isFinite(offset)) return 0;
  const wrapped = ((offset % sequenceWidth) + sequenceWidth) % sequenceWidth;
  return wrapped === 0 ? 0 : wrapped - sequenceWidth;
}

/** Advance an offset by `speed` px/s for `dt` seconds in the track's direction. */
export function advanceOffset(offset: number, direction: RailDirection, speed: number, dt: number, sequenceWidth: number): number {
  const delta = Math.max(0, speed) * Math.max(0, dt);
  return wrapOffset(direction === "left" ? offset - delta : offset + delta, sequenceWidth);
}

/** Copies needed so the strip always covers the viewport plus one sequence. */
export function copiesNeeded(viewportWidth: number, sequenceWidth: number): number {
  if (!(sequenceWidth > 0)) return 2;
  return Math.min(12, Math.max(2, Math.ceil(viewportWidth / sequenceWidth) + 1));
}

/** Target multiplier from scroll velocity (px/s), hover and pause; never negative. */
export function targetMultiplier(profile: RailProfile, scrollVelocity: number, hovered: boolean, paused: boolean): number {
  if (paused) return 0;
  const boost = Math.min(profile.maxMultiplier - 1, (Math.abs(scrollVelocity) / 1000) * profile.scrollSensitivity);
  return (1 + Math.max(0, boost)) * (hovered ? profile.hoverFactor : 1);
}

/**
 * Exponential damping toward `target` — frame-rate independent, so a slow
 * device eases the same way as a fast one and nothing snaps.
 */
export function dampMultiplier(current: number, target: number, dt: number, profile: RailProfile): number {
  const rate = target > current ? profile.accelerate : profile.decelerate;
  const blend = 1 - Math.exp(-rate * Math.max(0, dt));
  return current + (target - current) * blend;
}

/** Smooth an instantaneous scroll velocity reading (px/s). */
export function smoothVelocity(previous: number, instantaneous: number, dt: number): number {
  const blend = 1 - Math.exp(-12 * Math.max(0, dt));
  return previous + (instantaneous - previous) * blend;
}
