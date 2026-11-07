import { isAddress } from "@solana/kit";
import type { ParseIntentResponse } from "../types";
import type { RawModelIntent } from "../schema";
import { parseSolAmount } from "./amount-to-lamports";

/** Generous ceiling used only to compare numbers; the UI applies the real demo limit. */
const COMPARISON_MAX_LAMPORTS = 10n ** 30n;
const ADDRESS_TOKEN = /(?<![a-zA-Z0-9])[1-9A-HJ-NP-Za-km-z]{32,44}(?![a-zA-Z0-9])/g;
// Read the WHOLE numeric-looking token. Taking decimal substrings would turn
// -0.1 into 0.1, 0,1 into 1, or 1e-1 into 1. Ambiguous input needs clarification.
const NUMBER_TOKEN = /(?<![\p{L}\p{N}_.,+\-\u2212])[-+\u2212]?(?:\d|\.\d)[\p{L}\p{N}_.,+\-\u2212]*/gu;
/** Control, bidi-override and zero-width code point ranges stripped from AI text. */
const INVISIBLE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x00, 0x1f],
  [0x7f, 0x9f],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
];

function stripInvisible(value: string): string {
  let result = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    result += INVISIBLE_RANGES.some(([from, to]) => code >= from && code <= to) ? " " : char;
  }
  return result;
}

const DEFAULT_EXPLANATIONS: Record<ParseIntentResponse["status"], string> = {
  complete: "I identified a native SOL transfer. Review every detail before approving.",
  needs_input: "Some details are missing. Provide them exactly — nothing will be guessed.",
  unsupported: "Only native SOL transfers on Solana Devnet are supported.",
};

/** One unambiguous, unsigned decimal value; malformed numeric tokens invalidate it. */
function amountInText(text: string): bigint | null {
  const found = new Set<bigint>();
  // Address digits never count as amounts, including a malformed long address.
  const withoutAddresses = text.replace(/[a-zA-Z0-9]{32,}/g, " ");
  for (const match of withoutAddresses.matchAll(NUMBER_TOKEN)) {
    const token = match[0].replace(/SOL$/i, "");
    // A separated sign is still part of a signed amount, not a new positive value.
    if (/[-+\u2212]\s*$/.test(withoutAddresses.slice(0, match.index))) return null;
    const parsed = parseSolAmount(token, { maxLamports: COMPARISON_MAX_LAMPORTS });
    if (!parsed.ok) return null;
    found.add(parsed.lamports);
  }
  return found.size === 1 ? [...found][0]! : null;
}

/** Address-shaped tokens literally present in the text (exact substrings). */
function addressesInText(text: string): Set<string> {
  return new Set((text.match(ADDRESS_TOKEN) ?? []).filter(isAddress));
}

export function sanitizeExplanation(value: unknown, fallback: string, maxLength = 240): string {
  if (typeof value !== "string") return fallback;
  const cleaned = stripInvisible(value).replace(/\s+/g, " ").trim();
  if (cleaned.length === 0) return fallback;
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned;
}

/**
 * Deterministic guards applied to every AI parse result (server AND client).
 *
 * - The recipient must be a valid address that appears verbatim in the user's
 *   text: the model can never invent, complete, or resolve a recipient.
 * - There must be one distinct recipient and one unsigned decimal amount.
 *   Signed/comma/exponent tokens and multiple candidates need clarification.
 * - Status and missing fields are recomputed from the guarded values, so the
 *   model cannot claim "complete" for an incomplete draft.
 */
export function enforceIntentGuards(raw: RawModelIntent, userText: string): ParseIntentResponse {
  const action = raw.draft.action === "transfer_native_sol" ? "transfer_native_sol" : null;

  // Anything that is not explicitly a native SOL transfer is unsupported: no draft is prefilled.
  if (raw.status === "unsupported" || action === null) {
    return {
      status: "unsupported",
      draft: { action: null, amountSol: null, recipient: null },
      missingFields: [],
      explanation: sanitizeExplanation(raw.explanation, DEFAULT_EXPLANATIONS.unsupported),
    };
  }

  const textAmount = amountInText(userText);
  const textAddresses = addressesInText(userText);

  let amountSol: string | null = null;
  const rawAmount = typeof raw.draft.amountSol === "number" ? null : raw.draft.amountSol;
  if (typeof rawAmount === "string") {
    const parsed = parseSolAmount(rawAmount, { maxLamports: COMPARISON_MAX_LAMPORTS });
    if (parsed.ok && textAmount === parsed.lamports) amountSol = parsed.normalized;
  }

  let recipient: string | null = null;
  if (typeof raw.draft.recipient === "string") {
    const candidate = raw.draft.recipient.trim();
    if (textAddresses.size === 1 && isAddress(candidate) && textAddresses.has(candidate)) {
      recipient = candidate;
    }
  }

  const missingFields: Array<"amountSol" | "recipient"> = [];
  if (amountSol === null) missingFields.push("amountSol");
  if (recipient === null) missingFields.push("recipient");
  const status = missingFields.length === 0 ? "complete" : "needs_input";
  const clarification = textAddresses.size > 1
    ? "Your request contains more than one recipient. Choose one full address, or enter the transfer manually."
    : amountSol === null
      ? "Enter one exact unsigned decimal amount in SOL (for example 0.1). Commas and scientific notation are not supported."
      : "Paste one full Solana recipient address. Names and incomplete addresses are never resolved.";

  return {
    status,
    draft: { action: "transfer_native_sol", amountSol, recipient },
    missingFields,
    explanation: status === "needs_input" ? clarification : sanitizeExplanation(raw.explanation, DEFAULT_EXPLANATIONS[status]),
  };
}
