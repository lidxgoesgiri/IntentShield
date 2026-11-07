import { describe, expect, it } from "vitest";
import {
  advanceOffset,
  copiesNeeded,
  dampMultiplier,
  smoothVelocity,
  targetMultiplier,
  wrapOffset,
} from "@/features/landing/rail/marquee-engine";
import { RAIL_CAPABILITIES, RAIL_PROFILES, railProfileForWidth } from "@/features/landing/rail/rail-config";
import { TECH_MARKS } from "@/features/landing/rail/tech-marks";

const desktop = RAIL_PROFILES.desktop;

describe("rail engine — seamless loop", () => {
  it("keeps every offset inside [-sequence, 0)", () => {
    for (const value of [-1, -999, -1000, -1001, 0, 1, 250, 9999, -12345.5]) {
      const wrapped = wrapOffset(value, 1000);
      expect(wrapped).toBeGreaterThanOrEqual(-1000);
      expect(wrapped).toBeLessThan(0.000001);
    }
    expect(wrapOffset(-1000, 1000)).toBe(0);
    expect(wrapOffset(5, 0)).toBe(0);
    expect(wrapOffset(Number.NaN, 100)).toBe(0);
  });

  it("moves left or right by speed × time and wraps by exactly one sequence (no jump)", () => {
    expect(advanceOffset(-10, "left", 60, 0.5, 400)).toBe(-40);
    // -10 + 30 = 20, which wraps to -380 (the same position modulo one sequence).
    expect(advanceOffset(-10, "right", 60, 0.5, 400)).toBe(-380);
    // Wrapping: the unwrapped travel equals speed × time whatever the boundary.
    let offset = -395;
    let travelled = 0;
    for (let i = 0; i < 600; i += 1) {
      const next = advanceOffset(offset, "left", 64, 1 / 60, 400);
      let delta = next - offset;
      if (delta > 200) delta -= 400;
      travelled += delta;
      expect(Math.abs(delta)).toBeLessThan(2);
      offset = next;
    }
    expect(travelled).toBeCloseTo(-64 * 10, 6);
  });

  it("asks for enough copies to cover the viewport plus one sequence", () => {
    expect(copiesNeeded(1440, 900)).toBe(3);
    expect(copiesNeeded(375, 1200)).toBe(2);
    expect(copiesNeeded(1920, 300)).toBe(8);
    expect(copiesNeeded(1000, 0)).toBe(2);
    expect(copiesNeeded(100000, 10)).toBe(12);
  });
});

describe("rail engine — speed response", () => {
  it("boosts with scroll velocity in either scroll direction, capped, never reversing", () => {
    expect(targetMultiplier(desktop, 0, false, false)).toBe(1);
    expect(targetMultiplier(desktop, 1000, false, false)).toBeCloseTo(1 + desktop.scrollSensitivity, 6);
    expect(targetMultiplier(desktop, -1000, false, false)).toBe(targetMultiplier(desktop, 1000, false, false));
    expect(targetMultiplier(desktop, 50000, false, false)).toBe(desktop.maxMultiplier);
    expect(targetMultiplier(desktop, 0, true, false)).toBe(desktop.hoverFactor);
    expect(targetMultiplier(desktop, 3000, false, true)).toBe(0);
  });

  it("eases toward the target frame-rate independently, without overshoot", () => {
    const at60 = Array.from({ length: 60 }).reduce<number>((m) => dampMultiplier(m, 4, 1 / 60, desktop), 1);
    const at30 = Array.from({ length: 30 }).reduce<number>((m) => dampMultiplier(m, 4, 1 / 30, desktop), 1);
    expect(at60).toBeCloseTo(at30, 6);
    expect(at60).toBeLessThanOrEqual(4);
    // Settling back is gentler than speeding up.
    const up = dampMultiplier(1, 4, 0.1, desktop) - 1;
    const down = 4 - dampMultiplier(4, 1, 0.1, desktop);
    expect(up).toBeGreaterThan(down);
  });

  it("smooths velocity readings", () => {
    const smoothed = smoothVelocity(0, 2000, 1 / 60);
    expect(smoothed).toBeGreaterThan(0);
    expect(smoothed).toBeLessThan(2000);
  });

  it("uses calmer profiles on smaller screens", () => {
    expect(railProfileForWidth(1440)).toBe("desktop");
    expect(railProfileForWidth(800)).toBe("tablet");
    expect(railProfileForWidth(375)).toBe("mobile");
    expect(RAIL_PROFILES.mobile.maxMultiplier).toBeLessThan(RAIL_PROFILES.desktop.maxMultiplier);
    expect(RAIL_PROFILES.mobile.scrollSensitivity).toBeLessThan(RAIL_PROFILES.desktop.scrollSensitivity);
    expect(RAIL_PROFILES.mobile.hoverFactor).toBe(1);
  });
});

describe("rail content", () => {
  it("lists the real stack and the app's real capabilities", () => {
    expect(TECH_MARKS.map((mark) => mark.name)).toEqual(["Solana", "OpenRouter", "Next.js", "TypeScript", "Vercel", "Tailwind CSS"]);
    for (const mark of TECH_MARKS) expect(["M", "m"]).toContain(mark.path.charAt(0));
    expect(RAIL_CAPABILITIES).toEqual(["Simulation", "Verification", "AI Explanation", "Devnet", "Transaction Inspection", "Intent Matching"]);
  });
});
