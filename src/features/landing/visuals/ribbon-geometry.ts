/**
 * Signature energy-ribbon geometry (pure, deterministic, no DOM).
 *
 * A ribbon is a band of thin strands laid across a cubic centerline. The band
 * twists along its length (the strands converge where the band turns edge-on),
 * drifts slowly like a current, and bends away from an optional cursor point.
 * The same input always produces the same paths, so the server-rendered frame
 * (time = 0) matches the first client render exactly.
 */

export type Vec = Readonly<{ x: number; y: number }>;
export type CubicSegment = readonly [Vec, Vec, Vec, Vec];

export type RibbonSpec = Readonly<{
  /** Continuous centerline: each segment starts where the previous one ends. */
  segments: readonly CubicSegment[];
  /** Half width of the band at its widest. */
  halfWidth: number;
  /** Strand count (≥ 2). The outer two read as the band's edges. */
  strands: number;
  /** Full twists along the length. */
  twists: number;
  /** Points per strand. */
  samples: number;
  /** Amplitude of the slow organic drift along the normal. */
  wobble: number;
}>;

export type RibbonFrameInput = Readonly<{
  /** Seconds since the animation started (0 for the static frame). */
  time: number;
  /** Extra twist phase (e.g. from scroll progress). */
  flow?: number;
  /** Cursor in viewBox coordinates, or null. */
  cursor?: Vec | null;
  cursorRadius?: number;
  cursorStrength?: number;
}>;

const TAU = Math.PI * 2;

function cubicPoint([p0, p1, p2, p3]: CubicSegment, t: number): Vec {
  const m = 1 - t;
  const a = m * m * m;
  const b = 3 * m * m * t;
  const c = 3 * m * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

function cubicTangent([p0, p1, p2, p3]: CubicSegment, t: number): Vec {
  const m = 1 - t;
  const x = 3 * m * m * (p1.x - p0.x) + 6 * m * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x);
  const y = 3 * m * m * (p1.y - p0.y) + 6 * m * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y);
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

/** Width envelope: zero at both ends so the ribbon emerges and dissolves. */
export function taper(u: number): number {
  const s = Math.sin(Math.PI * Math.min(1, Math.max(0, u)));
  return Math.pow(s, 0.65);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

type Sample = { x: number; y: number; nx: number; ny: number; u: number };

/** Sample the centerline with drift and cursor displacement applied. */
export function sampleCenterline(spec: RibbonSpec, input: RibbonFrameInput): Sample[] {
  const { segments, samples, wobble } = spec;
  const count = Math.max(2, samples);
  const time = input.time;
  const radius = input.cursorRadius ?? 180;
  const strength = input.cursorStrength ?? 34;
  const cursor = input.cursor ?? null;
  const out: Sample[] = [];

  for (let i = 0; i < count; i += 1) {
    const u = i / (count - 1);
    const scaled = u * segments.length;
    const index = Math.min(segments.length - 1, Math.floor(scaled));
    const segment = segments[index]!;
    const t = index === segments.length - 1 && u === 1 ? 1 : scaled - index;
    const p = cubicPoint(segment, t);
    const tangent = cubicTangent(segment, t);
    const nx = -tangent.y;
    const ny = tangent.x;

    const drift =
      wobble *
      taper(u) *
      (0.62 * Math.sin(TAU * 1.3 * u + time * 0.55) + 0.38 * Math.sin(TAU * 2.7 * u - time * 0.37 + 1.1));
    let x = p.x + nx * drift;
    let y = p.y + ny * drift;

    if (cursor) {
      const dx = x - cursor.x;
      const dy = y - cursor.y;
      const distance = Math.hypot(dx, dy) || 1;
      const push = strength * Math.exp(-(distance * distance) / (2 * radius * radius));
      x += (dx / distance) * push;
      y += (dy / distance) * push;
    }

    out.push({ x, y, nx, ny, u });
  }
  return out;
}

/** Half width of the band at `u`, signed: negative values mirror the strands (the twist). */
export function twistWidth(spec: RibbonSpec, u: number, time: number, flow = 0): number {
  const phase = TAU * spec.twists * u - time * 0.9 + flow;
  return spec.halfWidth * taper(u) * Math.cos(phase);
}

function toPath(points: readonly { x: number; y: number }[]): string {
  let d = "";
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i]!;
    d += `${i === 0 ? "M" : "L"}${round(point.x)} ${round(point.y)}`;
  }
  return d;
}

/** One `d` string per strand, outer strands first and last. */
export function strandPaths(spec: RibbonSpec, input: RibbonFrameInput): string[] {
  const centerline = sampleCenterline(spec, input);
  const strands = Math.max(2, spec.strands);
  const widths = centerline.map((sample) => twistWidth(spec, sample.u, input.time, input.flow ?? 0));
  const paths: string[] = [];
  for (let k = 0; k < strands; k += 1) {
    const offset = (2 * k) / (strands - 1) - 1;
    paths.push(toPath(centerline.map((sample, i) => ({ x: sample.x + sample.nx * widths[i]! * offset, y: sample.y + sample.ny * widths[i]! * offset }))));
  }
  return paths;
}

/** The (displaced) centerline as a path, used for the travelling energy pulse. */
export function centerlinePath(spec: RibbonSpec, input: RibbonFrameInput): string {
  return toPath(sampleCenterline(spec, input));
}

const v = (x: number, y: number): Vec => ({ x, y });

/**
 * Hero ribbon (desktop, 1440 × 960 space): rises from beneath the copy column,
 * passes the security core and leaves through the upper right.
 */
export const HERO_RIBBON_SPEC: RibbonSpec = {
  segments: [
    [v(-160, 930), v(160, 1010), v(470, 900), v(660, 740)],
    [v(660, 740), v(860, 572), v(840, 412), v(1010, 330)],
    [v(1010, 330), v(1190, 244), v(1330, 300), v(1620, 120)],
  ],
  halfWidth: 46,
  strands: 9,
  twists: 1.6,
  samples: 96,
  wobble: 18,
};

/** Compact ribbon (mobile/tablet, 600 × 600 space around the core). */
export const HERO_RIBBON_COMPACT_SPEC: RibbonSpec = {
  segments: [
    [v(-60, 560), v(120, 600), v(220, 470), v(300, 380)],
    [v(300, 380), v(380, 290), v(470, 200), v(660, 70)],
  ],
  halfWidth: 30,
  strands: 6,
  twists: 1.2,
  samples: 56,
  wobble: 10,
};
