import type { TransferStatus } from "../types";

export type StepId = "describe" | "review" | "verify" | "sign" | "confirm";

export const STEPS: ReadonlyArray<{ id: StepId; label: string }> = [
  { id: "describe", label: "Describe" },
  { id: "review", label: "Review" },
  { id: "verify", label: "Verify" },
  { id: "sign", label: "Sign" },
  { id: "confirm", label: "Confirm" },
];

const STEP_OF: Record<TransferStatus, StepId> = {
  IDLE: "describe",
  PARSING_INTENT: "describe",
  NEEDS_INPUT: "describe",
  AI_UNAVAILABLE: "describe",
  DRAFT_READY: "review",
  INTENT_APPROVED: "verify",
  BUILDING: "verify",
  VERIFYING: "verify",
  BLOCKED: "verify",
  UNABLE_TO_VERIFY: "verify",
  SIMULATING: "verify",
  SIMULATION_FAILED: "verify",
  READY_TO_SIGN: "sign",
  AWAITING_WALLET: "sign",
  WALLET_REJECTED: "sign",
  SUBMIT_FAILED: "sign",
  SUBMITTED: "confirm",
  CONFIRMING: "confirm",
  CONFIRMED: "confirm",
  ONCHAIN_FAILED: "confirm",
  EXPIRED: "confirm",
  UNKNOWN: "confirm",
};

export function stepOf(status: TransferStatus): StepId {
  return STEP_OF[status];
}

/** Statuses that represent a stop condition at the current step. */
export const PROBLEM_STATUSES: ReadonlySet<TransferStatus> = new Set([
  "BLOCKED",
  "UNABLE_TO_VERIFY",
  "SIMULATION_FAILED",
  "WALLET_REJECTED",
  "SUBMIT_FAILED",
  "ONCHAIN_FAILED",
  "EXPIRED",
  "UNKNOWN",
]);

/** Plain-language status line announced via aria-live (PRD §11.7 microcopy). */
export const STATUS_COPY: Record<TransferStatus, string> = {
  IDLE: "Describe a transfer or enter the details manually.",
  PARSING_INTENT: "Reading your request…",
  NEEDS_INPUT: "Some details are missing. Nothing will be guessed.",
  AI_UNAVAILABLE: "AI help is offline. Enter the transfer details manually.",
  DRAFT_READY: "Review the details, then approve your intent.",
  INTENT_APPROVED: "Intent approved. Preparing the transaction…",
  BUILDING: "Fetching a recent blockhash from Solana Devnet and compiling the final message…",
  VERIFYING: "Decoding the exact message and comparing it with your approved intent…",
  BLOCKED: "Verification failed. Signing is disabled.",
  UNABLE_TO_VERIFY: "Unable to verify. Signing is disabled.",
  SIMULATING: "Simulating the exact transaction on Solana Devnet…",
  SIMULATION_FAILED: "Simulation failed. Signing is disabled.",
  READY_TO_SIGN: "Intent matched and simulation passed. You can sign with your wallet.",
  AWAITING_WALLET: "Confirm the request in your wallet.",
  WALLET_REJECTED: "You rejected the request in your wallet. Nothing was sent.",
  SUBMIT_FAILED: "The network did not accept the transaction. Nothing was broadcast.",
  SUBMITTED: "Transaction submitted. Waiting for on-chain confirmation.",
  CONFIRMING: "Waiting for on-chain confirmation…",
  CONFIRMED: "Confirmed on Solana Devnet.",
  ONCHAIN_FAILED: "The transaction landed but failed on chain.",
  EXPIRED: "The transaction expired before it was confirmed. It can no longer land.",
  UNKNOWN: "Confirmation was not observed in time. Check the explorer before trying again.",
};
