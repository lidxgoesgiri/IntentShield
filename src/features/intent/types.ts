import type { Address } from "@solana/kit";
import type { SupportedChain } from "@/config/product";

/** Editable, untrusted draft. Values are strings exactly as typed/parsed. */
export type IntentDraft = Readonly<{
  amountSol: string;
  recipient: string;
  /** Where the current values came from — display only, never a trust signal. */
  source: "ai" | "manual";
}>;

/**
 * The immutable intent the user explicitly approved. Every later check is a
 * comparison against these exact values; any edit discards the approval.
 */
export type ApprovedIntent = Readonly<{
  kind: "native_sol_transfer";
  /** Connected wallet public key at approval time. */
  sender: Address;
  /** Full recipient address, validated as a Solana public key. */
  recipient: Address;
  /** Exact integer amount derived from the approved decimal string. */
  amountLamports: bigint;
  /** Canonical decimal string shown to the user at approval time. */
  amountSol: string;
  cluster: SupportedChain;
  approvedAt: number;
  /** Unique per approval; at most one signing request may use it. */
  approvalId: string;
}>;

export type ParseIntentStatus = "complete" | "needs_input" | "unsupported";

/** Structured AI output contract (PRD §9.3). Untrusted until validated. */
export type ParseIntentResponse = {
  status: ParseIntentStatus;
  draft: {
    action: "transfer_native_sol" | null;
    amountSol: string | null;
    recipient: string | null;
  };
  missingFields: Array<"amountSol" | "recipient">;
  explanation: string;
};
