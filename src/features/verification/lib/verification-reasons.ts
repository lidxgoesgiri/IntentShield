import type { VerificationReason } from "../types";

export type ReasonInfo = Readonly<{
  code: VerificationReason;
  title: string;
  /** Deterministic, rule-engine explanation shown regardless of AI availability. */
  detail: string;
}>;

/** Display order: the most consequential mismatch first. */
const REASON_ORDER: readonly VerificationReason[] = [
  "MESSAGE_CHANGED",
  "RECIPIENT_MISMATCH",
  "AMOUNT_MISMATCH",
  "SENDER_MISMATCH",
  "FEE_PAYER_MISMATCH",
  "UNSUPPORTED_PROGRAM",
  "UNSUPPORTED_INSTRUCTION",
  "UNEXPECTED_ADDITIONAL_INSTRUCTION",
  "UNSUPPORTED_MESSAGE_FORMAT",
  "WRONG_CLUSTER",
  "INVALID_INTENT",
  "DECODE_FAILED",
];

export function sortReasons(reasons: readonly VerificationReason[]): VerificationReason[] {
  return [...new Set(reasons)].sort((a, b) => REASON_ORDER.indexOf(a) - REASON_ORDER.indexOf(b));
}

const REASONS: Record<VerificationReason, ReasonInfo> = {
  MESSAGE_CHANGED: {
    code: "MESSAGE_CHANGED",
    title: "Transaction changed after review",
    detail: "The bytes about to be signed are not the bytes that were reviewed. Signing is disabled.",
  },
  RECIPIENT_MISMATCH: {
    code: "RECIPIENT_MISMATCH",
    title: "Recipient differs from your approval",
    detail: "The transaction sends SOL to a different address than the one you approved. Signing is disabled.",
  },
  AMOUNT_MISMATCH: {
    code: "AMOUNT_MISMATCH",
    title: "Amount differs from your approval",
    detail: "The transaction moves a different number of lamports than you approved. Signing is disabled.",
  },
  SENDER_MISMATCH: {
    code: "SENDER_MISMATCH",
    title: "Funds would leave a different account",
    detail: "The transfer's source account is not your connected wallet. Signing is disabled.",
  },
  FEE_PAYER_MISMATCH: {
    code: "FEE_PAYER_MISMATCH",
    title: "Unexpected fee payer",
    detail: "The fee payer is not your connected wallet. Signing is disabled.",
  },
  UNSUPPORTED_PROGRAM: {
    code: "UNSUPPORTED_PROGRAM",
    title: "Unsupported program",
    detail: "The transaction calls a program other than the System Program. Only native SOL transfers are supported.",
  },
  UNSUPPORTED_INSTRUCTION: {
    code: "UNSUPPORTED_INSTRUCTION",
    title: "Unsupported instruction",
    detail: "The instruction is not a well-formed System Program Transfer. Only native SOL transfers are supported.",
  },
  UNEXPECTED_ADDITIONAL_INSTRUCTION: {
    code: "UNEXPECTED_ADDITIONAL_INSTRUCTION",
    title: "Extra instruction detected",
    detail: "The transaction contains more than the single transfer you approved. Signing is disabled.",
  },
  UNSUPPORTED_MESSAGE_FORMAT: {
    code: "UNSUPPORTED_MESSAGE_FORMAT",
    title: "Unsupported transaction format",
    detail:
      "The message uses features the MVP does not verify (lookup tables, extra signers, unexpected accounts, or an unsupported version).",
  },
  WRONG_CLUSTER: {
    code: "WRONG_CLUSTER",
    title: "Not Solana Devnet",
    detail: "The network could not be confirmed as Solana Devnet. IntentShield only operates on Devnet.",
  },
  INVALID_INTENT: {
    code: "INVALID_INTENT",
    title: "Approved intent is invalid",
    detail: "The approved amount or addresses no longer pass validation. Review and approve again.",
  },
  DECODE_FAILED: {
    code: "DECODE_FAILED",
    title: "Transaction could not be decoded",
    detail: "The message bytes could not be decoded reliably, so no security conclusion was produced.",
  },
};

export function describeReason(reason: VerificationReason): ReasonInfo {
  return REASONS[reason];
}

export function describeReasons(reasons: readonly VerificationReason[]): ReasonInfo[] {
  return sortReasons(reasons).map(describeReason);
}
