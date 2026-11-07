import { isAddress } from "@solana/kit";
import type { ParseIntentResponse } from "../types";
import type { RawModelIntent } from "../schema";
import { parseSolAmount } from "./amount-to-lamports";

/** Generous ceiling used only to compare numbers; the UI applies the real demo limit. */
const COMPARISON_MAX_LAMPORTS = 10n ** 30n;
const ADDRESS_TOKEN = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;
const NUMBER_TOKEN = /(?<![\w.])\d+(?:\.\d+)?(?![\w.])/g;
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

/** Lamport values of every plain decimal number literally present in the text. */
function numbersInText(text: string): Set<bigint> {
  const found = new Set<bigint>();
  for (const match of text.matchAll(NUMBER_TOKEN)) {
    const parsed = parseSolAmount(match[0], { maxLamports: COMPARISON_MAX_LAMPORTS });
    if (parsed.ok) found.add(parsed.lamports);
  }
  return found;
}

/** Address-shaped tokens literally present in the text (exact substrings). */
function addressesInText(text: string): Set<string> {
  return new Set(text.match(ADDRESS_TOKEN) ?? []);
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
 * - The amount must equal a number the user literally wrote: "all my SOL",
 *   "half", or hallucinated amounts become `null` → needs_input.
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

  const textNumbers = numbersInText(userText);
  const textAddresses = addressesInText(userText);

  let amountSol: string | null = null;
  const rawAmount = typeof raw.draft.amountSol === "number" ? null : raw.draft.amountSol;
  if (typeof rawAmount === "string") {
    const parsed = parseSolAmount(rawAmount, { maxLamports: COMPARISON_MAX_LAMPORTS });
    if (parsed.ok && textNumbers.has(parsed.lamports)) amountSol = parsed.normalized;
  }

  let recipient: string | null = null;
  if (typeof raw.draft.recipient === "string") {
    const candidate = raw.draft.recipient.trim();
    if (isAddress(candidate) && textAddresses.has(candidate) && userText.includes(candidate)) {
      recipient = candidate;
    }
  }

  const missingFields: Array<"amountSol" | "recipient"> = [];
  if (amountSol === null) missingFields.push("amountSol");
  if (recipient === null) missingFields.push("recipient");
  const status = missingFields.length === 0 ? "complete" : "needs_input";

  return {
    status,
    draft: { action: "transfer_native_sol", amountSol, recipient },
    missingFields,
    explanation: sanitizeExplanation(raw.explanation, DEFAULT_EXPLANATIONS[status]),
  };
}
