import type { ApprovedIntent } from "@/features/intent/types";
import type { VerificationResult } from "@/features/verification/types";
import type { PreparedTransfer } from "./lib/build-transfer";

export type SimulationStatus = "passed" | "failed" | "unavailable" | "timeout";

/** PRD §15 SimulationResult, extended with status/code/logs for the panel. */
export type SimulationResult = Readonly<{
  ok: boolean;
  status: SimulationStatus;
  error: string | null;
  errorCode: string | null;
  logs: readonly string[];
  unitsConsumed?: bigint;
  /** Network fee for the exact message, when the RPC reported it. */
  feeLamports?: bigint;
  /** Sender balance observed during preflight, when available. */
  balanceLamports?: bigint;
  /** Fingerprint of the exact bytes that were simulated. */
  simulatedFingerprint: string;
  checkedAt: number;
}>;

export type ReceiptStatus = "submitted" | "confirming" | "confirmed" | "onchain_failed" | "expired" | "unknown";

export type TransactionReceipt = Readonly<{
  status: ReceiptStatus;
  signature: string;
  amountLamports: bigint;
  sender: string;
  recipient: string;
  cluster: "devnet";
  submittedAt: number;
  confirmationStatus: "processed" | "confirmed" | "finalized" | null;
  slot: bigint | null;
  error: string | null;
  /** Unix seconds from getTransaction, when available. */
  blockTime: bigint | null;
  feeLamports: bigint | null;
}>;

export type SignedTransfer = Readonly<{
  /** Base58 transaction signature (the sender's signature). */
  signature: string;
  wireBase64: string;
  signedMessageFingerprint: string;
  signedAt: number;
}>;

/** Authoritative workflow states (PRD §7) + explicit pre-sign UNABLE_TO_VERIFY / SUBMIT_FAILED. */
export type TransferStatus =
  | "IDLE"
  | "PARSING_INTENT"
  | "NEEDS_INPUT"
  | "AI_UNAVAILABLE"
  | "DRAFT_READY"
  | "INTENT_APPROVED"
  | "BUILDING"
  | "VERIFYING"
  | "BLOCKED"
  | "UNABLE_TO_VERIFY"
  | "SIMULATING"
  | "SIMULATION_FAILED"
  | "READY_TO_SIGN"
  | "AWAITING_WALLET"
  | "WALLET_REJECTED"
  | "SUBMIT_FAILED"
  | "SUBMITTED"
  | "CONFIRMING"
  | "CONFIRMED"
  | "ONCHAIN_FAILED"
  | "EXPIRED"
  | "UNKNOWN";

export type DraftState = Readonly<{
  amountSol: string;
  recipient: string;
  source: "ai" | "manual";
}>;

export type AiNotice = Readonly<{
  kind: "parsed" | "needs_input" | "unsupported" | "unavailable" | "rate_limited";
  message: string;
  /** Display-only, untrusted AI text. */
  explanation?: string;
  missingFields?: ReadonlyArray<"amountSol" | "recipient">;
}>;

export type TransferState = Readonly<{
  status: TransferStatus;
  /** Token of the in-flight AI parse request; stale responses are ignored. */
  parseRequestId: string | null;
  composerText: string;
  draft: DraftState;
  aiNotice: AiNotice | null;
  /** Wallet the draft/approval belongs to; a change invalidates everything. */
  walletAddress: string | null;
  approvedIntent: ApprovedIntent | null;
  prepared: PreparedTransfer | null;
  verification: VerificationResult | null;
  simulation: SimulationResult | null;
  /** Approval ids for which a signing request has already been made. */
  signRequestedFor: readonly string[];
  signed: SignedTransfer | null;
  receipt: TransactionReceipt | null;
  /** Persistent blocker/error copy (rendered inline, not as a toast). */
  error: Readonly<{ code: string; message: string }> | null;
  /** Informational notice, e.g. "approval cleared because the wallet changed". */
  notice: string | null;
}>;
