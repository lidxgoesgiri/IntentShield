import { isAddress, type Address } from "@solana/kit";
import { MAX_DEMO_LAMPORTS, MAX_DEMO_SOL, SUPPORTED_CHAIN } from "@/config/product";
import type { ApprovedIntent, IntentDraft } from "../types";
import { amountErrorMessage, parseSolAmount, type AmountErrorCode } from "./amount-to-lamports";

export type RecipientErrorCode = "EMPTY" | "INVALID_ADDRESS" | "SAME_AS_SENDER";

export type RecipientValidation =
  | { ok: true; address: Address }
  | { ok: false; error: RecipientErrorCode };

/**
 * Validate a recipient as a real Solana public key (base58 that decodes to
 * exactly 32 bytes) — not merely a length/charset regex. Names such as "Budi"
 * are never resolved: there is no trusted address book in the MVP.
 */
export function validateRecipient(input: unknown, sender?: string | null): RecipientValidation {
  if (typeof input !== "string") return { ok: false, error: "INVALID_ADDRESS" };
  const text = input.trim();
  if (text.length === 0) return { ok: false, error: "EMPTY" };
  if (/\s/.test(text) || text.length > 44 || !isAddress(text)) {
    return { ok: false, error: "INVALID_ADDRESS" };
  }
  if (sender && text === sender) return { ok: false, error: "SAME_AS_SENDER" };
  return { ok: true, address: text };
}

export function recipientErrorMessage(error: RecipientErrorCode): string {
  switch (error) {
    case "EMPTY":
      return "Paste the recipient's full Solana address. We won't guess it.";
    case "INVALID_ADDRESS":
      return "That is not a valid Solana address. Paste the full base58 address.";
    case "SAME_AS_SENDER":
      return "The recipient is your connected wallet. Sending to yourself is not supported in this MVP.";
  }
}

export type DraftFieldErrors = Partial<Record<"amountSol" | "recipient", string>>;

export type DraftValidation =
  | {
      ok: true;
      value: { amountLamports: bigint; amountSol: string; recipient: Address };
      errors: DraftFieldErrors;
    }
  | {
      ok: false;
      errors: DraftFieldErrors;
      codes: { amountSol?: AmountErrorCode; recipient?: RecipientErrorCode };
    };

export function validateDraft(draft: Pick<IntentDraft, "amountSol" | "recipient">, sender?: string | null): DraftValidation {
  const amount = parseSolAmount(draft.amountSol, { maxLamports: MAX_DEMO_LAMPORTS });
  const recipient = validateRecipient(draft.recipient, sender);

  if (amount.ok && recipient.ok) {
    return {
      ok: true,
      value: { amountLamports: amount.lamports, amountSol: amount.normalized, recipient: recipient.address },
      errors: {},
    };
  }

  const errors: DraftFieldErrors = {};
  const codes: { amountSol?: AmountErrorCode; recipient?: RecipientErrorCode } = {};
  if (!amount.ok) {
    errors.amountSol = amountErrorMessage(amount.error, MAX_DEMO_SOL);
    codes.amountSol = amount.error;
  }
  if (!recipient.ok) {
    errors.recipient = recipientErrorMessage(recipient.error);
    codes.recipient = recipient.error;
  }
  return { ok: false, errors, codes };
}

function newApprovalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Extremely old runtimes only; uniqueness, not secrecy, is required here.
  return `approval-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export type ApproveIntentResult =
  | { ok: true; intent: ApprovedIntent }
  | { ok: false; errors: DraftFieldErrors | { sender: string } };

/**
 * Freeze the user's explicit approval onto immutable values. Requires a
 * connected sender; re-validates everything instead of trusting the caller.
 */
export function approveIntent(
  draft: Pick<IntentDraft, "amountSol" | "recipient">,
  sender: string | null | undefined,
  now: number = Date.now(),
): ApproveIntentResult {
  if (!sender || !isAddress(sender)) {
    return { ok: false, errors: { sender: "Connect a Devnet wallet to continue." } };
  }
  const validation = validateDraft(draft, sender);
  if (!validation.ok) return { ok: false, errors: validation.errors };

  const intent: ApprovedIntent = Object.freeze({
    kind: "native_sol_transfer",
    sender,
    recipient: validation.value.recipient,
    amountLamports: validation.value.amountLamports,
    amountSol: validation.value.amountSol,
    cluster: SUPPORTED_CHAIN,
    approvedAt: now,
    approvalId: newApprovalId(),
  });
  return { ok: true, intent };
}
