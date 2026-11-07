/**
 * Shorten an address for compact UI. Callers must always offer the full
 * address nearby (copy / expand) — truncation alone hides lookalike attacks.
 */
export function shortenAddress(value: string, head = 4, tail = 4): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export type CharDiffSegment = { text: string; changed: boolean };

/**
 * Character-level positional diff of two equal-purpose strings (addresses).
 * Used to visualise which characters differ between intended and actual
 * recipients. Extra trailing characters are marked as changed.
 */
export function diffCharacters(expected: string, actual: string): CharDiffSegment[] {
  const segments: CharDiffSegment[] = [];
  const max = Math.max(expected.length, actual.length);
  for (let i = 0; i < max; i += 1) {
    const ch = actual[i] ?? "";
    const changed = expected[i] !== actual[i];
    const last = segments[segments.length - 1];
    if (last && last.changed === changed) {
      last.text += ch;
    } else {
      segments.push({ text: ch, changed });
    }
  }
  return segments.filter((segment) => segment.text.length > 0);
}

export function countChangedCharacters(expected: string, actual: string): number {
  const max = Math.max(expected.length, actual.length);
  let changed = 0;
  for (let i = 0; i < max; i += 1) {
    if (expected[i] !== actual[i]) changed += 1;
  }
  return changed;
}
