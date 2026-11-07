import { sha256Hex } from "./sha256";

/**
 * Local fingerprint of the exact message bytes that were reviewed.
 * It is an integrity marker for "the bytes did not change since review" —
 * never a signing authority and never sent anywhere.
 */
export function fingerprintMessage(messageBytes: Uint8Array | ArrayLike<number>): string {
  return `sha256:${sha256Hex(messageBytes)}`;
}

/** Short, human-scannable form of a fingerprint for UI display. */
export function shortFingerprint(fingerprint: string): string {
  const hex = fingerprint.replace(/^sha256:/, "");
  return `${hex.slice(0, 8)}…${hex.slice(-8)}`;
}

/** Constant-shape byte equality (length + every byte). */
export function bytesEqual(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
