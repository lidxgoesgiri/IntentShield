/**
 * Verification domain types (PRD §15). These describe the deterministic
 * rule engine's output; AI output can never construct or alter them.
 */

export type VerificationReason =
  | "SENDER_MISMATCH"
  | "RECIPIENT_MISMATCH"
  | "AMOUNT_MISMATCH"
  | "FEE_PAYER_MISMATCH"
  | "WRONG_CLUSTER"
  | "UNSUPPORTED_PROGRAM"
  | "UNSUPPORTED_INSTRUCTION"
  | "UNEXPECTED_ADDITIONAL_INSTRUCTION"
  | "MESSAGE_CHANGED"
  | "DECODE_FAILED"
  // Additions beyond the PRD baseline (documented in docs/ARCHITECTURE.md):
  /** Address lookup tables, unsupported versions, or unexpected signer/account sets. */
  | "UNSUPPORTED_MESSAGE_FORMAT"
  /** The approved intent itself failed re-validation (defense in depth). */
  | "INVALID_INTENT";

export type VerificationStatus = "matched" | "blocked" | "unable_to_verify";

export type ComparisonField =
  | "action"
  | "sender"
  | "recipient"
  | "amount"
  | "feePayer"
  | "program"
  | "network"
  | "instructions";

export type ComparisonState = "match" | "changed" | "unsupported";

export type ComparisonRow = Readonly<{
  field: ComparisonField;
  expected: string;
  actual: string | null;
  state: ComparisonState;
}>;

export type DecodedTransfer = Readonly<{
  programId: string;
  sender: string;
  recipient: string;
  feePayer: string;
  amountLamports: bigint;
}>;

export type DecodedMessageSummary = Readonly<{
  version: "legacy" | 0 | 1 | "unknown";
  feePayer: string | null;
  lifetimeToken: string | null;
  instructionCount: number;
  staticAccountCount: number;
  /** Program ids of every instruction, in order. */
  programIds: readonly string[];
}>;

export type VerificationResult = Readonly<{
  ok: boolean;
  status: VerificationStatus;
  reasons: readonly VerificationReason[];
  checkedAt: number;
  /** Local integrity marker of the exact bytes checked; never a signing authority. */
  messageFingerprint: string;
  decoded: DecodedTransfer | null;
  message: DecodedMessageSummary | null;
  comparisons: readonly ComparisonRow[];
}>;

/** Network context the message was prepared in (from the verified RPC). */
export type VerificationContext = Readonly<{
  /** Wallet Standard chain id the message was built for, e.g. "solana:devnet". */
  cluster: string;
  /** Genesis hash reported by the RPC that supplied the blockhash. */
  genesisHash: string | null;
}>;

/** Minimal intent shape the verifier compares against. */
export type IntentForVerification = Readonly<{
  sender: string;
  recipient: string;
  amountLamports: bigint;
  cluster: string;
}>;
