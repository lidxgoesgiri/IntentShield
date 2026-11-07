import { LAMPORTS_PER_SOL, MAX_DEMO_LAMPORTS, SOL_DECIMALS } from "@/config/product";
import { formatLamportsAsSol } from "@/lib/format/sol";

export type AmountErrorCode =
  | "EMPTY"
  | "TOO_LONG"
  | "NEGATIVE"
  | "COMMA_DECIMAL"
  | "INVALID_FORMAT"
  | "TOO_MANY_DECIMALS"
  | "ZERO"
  | "EXCEEDS_LIMIT";

export type AmountParseResult =
  | { ok: true; lamports: bigint; normalized: string }
  | { ok: false; error: AmountErrorCode };

/** Plain decimal only: digits, optionally a dot followed by digits. */
const DECIMAL_PATTERN = /^(\d+)(?:\.(\d+))?$/;
const MAX_AMOUNT_TEXT_LENGTH = 32;

/**
 * Convert a decimal SOL string into integer lamports using BigInt only.
 *
 * Rejects (never coerces): empty input, negatives, comma decimals, scientific
 * notation, NaN/Infinity, hex, leading "+", ".5"/"5." forms, more than 9
 * decimal places, zero, and anything above the configured maximum.
 */
export function parseSolAmount(
  input: unknown,
  options: { maxLamports?: bigint } = {},
): AmountParseResult {
  const maxLamports = options.maxLamports ?? MAX_DEMO_LAMPORTS;
  if (typeof input !== "string") return { ok: false, error: "INVALID_FORMAT" };

  const text = input.trim();
  if (text.length === 0) return { ok: false, error: "EMPTY" };
  if (text.length > MAX_AMOUNT_TEXT_LENGTH) return { ok: false, error: "TOO_LONG" };
  if (text.startsWith("-")) return { ok: false, error: "NEGATIVE" };
  if (text.includes(",")) return { ok: false, error: "COMMA_DECIMAL" };

  const match = DECIMAL_PATTERN.exec(text);
  if (!match) return { ok: false, error: "INVALID_FORMAT" };

  const wholePart = match[1] ?? "0";
  const fractionPart = match[2] ?? "";
  if (fractionPart.length > SOL_DECIMALS) return { ok: false, error: "TOO_MANY_DECIMALS" };

  const lamports =
    BigInt(wholePart) * LAMPORTS_PER_SOL + BigInt(fractionPart.padEnd(SOL_DECIMALS, "0") || "0");

  if (lamports === 0n) return { ok: false, error: "ZERO" };
  if (lamports > maxLamports) return { ok: false, error: "EXCEEDS_LIMIT" };

  return { ok: true, lamports, normalized: formatLamportsAsSol(lamports) };
}

export function amountErrorMessage(error: AmountErrorCode, maxSol = "1"): string {
  switch (error) {
    case "EMPTY":
      return "Enter an amount in SOL.";
    case "TOO_LONG":
      return "That amount is too long to be valid.";
    case "NEGATIVE":
      return "Amount must be greater than zero.";
    case "COMMA_DECIMAL":
      return "Use a dot as the decimal separator, e.g. 0.1.";
    case "INVALID_FORMAT":
      return "Use a plain decimal number such as 0.1 (no symbols or scientific notation).";
    case "TOO_MANY_DECIMALS":
      return "SOL supports at most 9 decimal places (1 lamport = 0.000000001 SOL).";
    case "ZERO":
      return "Amount must be greater than zero.";
    case "EXCEEDS_LIMIT":
      return `This Devnet demo is limited to ${maxSol} SOL per transfer.`;
  }
}
