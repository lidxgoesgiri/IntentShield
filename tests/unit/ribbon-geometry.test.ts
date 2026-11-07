import { describe, expect, it } from "vitest";
import {
  centerlinePath,
  HERO_RIBBON_COMPACT_SPEC,
  HERO_RIBBON_SPEC,
  sampleCenterline,
  strandPaths,
  taper,
  twistWidth,
} from "@/features/landing/visuals/ribbon-geometry";

function numbers(d: string): number[] {
  return d
    .replace(/[ML]/g, " ")
    .trim()
    .split(/\s+/)
    .map(Number);
}

describe("signature ribbon geometry (pure, deterministic)", () => {
  it("is deterministic, so the server frame equals the first client frame (no hydration mismatch)", () => {
    expect(strandPaths(HERO_RIBBON_SPEC, { time: 0 })).toEqual(strandPaths(HERO_RIBBON_SPEC, { time: 0 }));
    expect(centerlinePath(HERO_RIBBON_SPEC, { time: 0 })).toBe(centerlinePath(HERO_RIBBON_SPEC, { time: 0 }));
  });

  it("produces one finite path per strand with the configured resolution", () => {
    for (const spec of [HERO_RIBBON_SPEC, HERO_RIBBON_COMPACT_SPEC]) {
      const paths = strandPaths(spec, { time: 3.7, flow: 1.2 });
      expect(paths).toHaveLength(spec.strands);
      for (const d of paths) {
        const values = numbers(d);
        expect(values).toHaveLength(spec.samples * 2);
        expect(values.every(Number.isFinite)).toBe(true);
      }
    }
  });

  it("tapers to a point at both ends so the band emerges and dissolves", () => {
    expect(taper(0)).toBe(0);
    expect(taper(1)).toBeCloseTo(0, 6);
    expect(taper(0.5)).toBeCloseTo(1, 6);
    const [first, , , , , , , , last] = strandPaths(HERO_RIBBON_SPEC, { time: 0 });
    const a = numbers(first!);
    const b = numbers(last!);
    expect(a.slice(0, 2)).toEqual(b.slice(0, 2));
    expect(a.slice(-2)).toEqual(b.slice(-2));
  });

  it("twists: the band's signed width changes sign along the length", () => {
    const widths = Array.from({ length: 40 }, (_, i) => twistWidth(HERO_RIBBON_SPEC, (i + 0.5) / 40, 0));
    expect(widths.some((w) => w > 1)).toBe(true);
    expect(widths.some((w) => w < -1)).toBe(true);
    for (const w of widths) expect(Math.abs(w)).toBeLessThanOrEqual(HERO_RIBBON_SPEC.halfWidth + 1e-9);
  });

  it("flows over time and leans away from a nearby cursor", () => {
    expect(strandPaths(HERO_RIBBON_SPEC, { time: 1 })).not.toEqual(strandPaths(HERO_RIBBON_SPEC, { time: 0 }));
    const still = sampleCenterline(HERO_RIBBON_SPEC, { time: 0 });
    const middle = still[Math.floor(still.length / 2)]!;
    const cursor = { x: middle.x + 20, y: middle.y };
    const bent = sampleCenterline(HERO_RIBBON_SPEC, { time: 0, cursor })[Math.floor(still.length / 2)]!;
    const before = Math.hypot(middle.x - cursor.x, middle.y - cursor.y);
    const after = Math.hypot(bent.x - cursor.x, bent.y - cursor.y);
    expect(after).toBeGreaterThan(before);
  });
});
