import { LAMPORTS_PER_SOL, SOL_DECIMALS } from "@/config/product";

/**
 * Format integer lamports as a canonical decimal SOL string without ever
 * passing through floating point (e.g. 100000000n -> "0.1").
 */
export function formatLamportsAsSol(lamports: bigint): string {
  const negative = lamports < 0n;
  const abs = negative ? -lamports : lamports;
  const whole = abs / LAMPORTS_PER_SOL;
  const fraction = abs % LAMPORTS_PER_SOL;
  const fractionText = fraction.toString().padStart(SOL_DECIMALS, "0").replace(/0+$/, "");
  const text = fractionText.length > 0 ? `${whole.toString()}.${fractionText}` : whole.toString();
  return negative ? `-${text}` : text;
}

/** Group an integer with thin separators for display: 100000000 -> "100,000,000". */
export function formatLamportsGrouped(lamports: bigint): string {
  const digits = (lamports < 0n ? -lamports : lamports).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return lamports < 0n ? `-${grouped}` : grouped;
}

export function formatSolWithUnit(lamports: bigint): string {
  return `${formatLamportsAsSol(lamports)} SOL`;
}
