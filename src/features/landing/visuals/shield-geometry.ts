/**
 * Original shield geometry for the hero Security Core (authored for
 * IntentShield; not derived from any reference asset). Points live in a
 * 100×100 unit box and are scaled around an arbitrary center.
 */
const SHIELD_UNIT: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
  // cubic segments: [c1x, c1y, c2x, c2y, x, y] starting from apex (50, 4)
  [62, 11.5, 76, 15.5, 90, 18],
  [92, 40, 90, 61, 80.5, 75.5],
  [72, 87, 62, 93.5, 50, 98],
  [38, 93.5, 28, 87, 19.5, 75.5],
  [10, 61, 8, 40, 10, 18],
  [24, 15.5, 38, 11.5, 50, 4],
];

/** Vertices used for facet lines (apex, shoulders, hips, base). */
export const SHIELD_VERTICES: ReadonlyArray<readonly [number, number]> = [
  [50, 4],
  [90, 18],
  [80.5, 75.5],
  [50, 98],
  [19.5, 75.5],
  [10, 18],
];

function scalePoint(x: number, y: number, cx: number, cy: number, size: number): [number, number] {
  return [cx + ((x - 50) / 100) * size, cy + ((y - 51) / 100) * size];
}

const round = (n: number) => Math.round(n * 100) / 100;

export function shieldPath(cx: number, cy: number, size: number): string {
  const [sx, sy] = scalePoint(50, 4, cx, cy, size);
  let d = `M${round(sx)} ${round(sy)}`;
  for (const [c1x, c1y, c2x, c2y, x, y] of SHIELD_UNIT) {
    const a = scalePoint(c1x, c1y, cx, cy, size);
    const b = scalePoint(c2x, c2y, cx, cy, size);
    const e = scalePoint(x, y, cx, cy, size);
    d += ` C${round(a[0])} ${round(a[1])} ${round(b[0])} ${round(b[1])} ${round(e[0])} ${round(e[1])}`;
  }
  return `${d} Z`;
}

export function shieldVertices(cx: number, cy: number, size: number): Array<[number, number]> {
  return SHIELD_VERTICES.map(([x, y]) => scalePoint(x, y, cx, cy, size)).map(([x, y]) => [round(x), round(y)]);
}
