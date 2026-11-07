import { validateDraft } from "@/features/intent/lib/intent-validation";
import type { ApprovedIntent, ParseIntentResponse } from "@/features/intent/types";
import type { VerificationContext, VerificationResult } from "@/features/verification/types";
import type { PreparedTransfer } from "./lib/build-transfer";
import { isSigningGateOpen } from "./lib/sign-transfer";
import type { SubmitOutcome } from "./lib/submit-transfer";
import type { StatusInterpretation } from "./lib/confirm-transfer";
import type {
  AiNotice,
  DraftState,
  SignedTransfer,
  SimulationResult,
  TransactionReceipt,
  TransferState,
  TransferStatus,
} from "./types";

export type MachineState = TransferState & Readonly<{ networkContext: VerificationContext | null }>;

export type TransferEvent =
  | { type: "COMPOSER_CHANGED"; text: string }
  | { type: "PARSE_STARTED"; requestId: string }
  | { type: "PARSE_SUCCEEDED"; requestId: string; response: ParseIntentResponse }
  | { type: "PARSE_FAILED"; requestId: string; kind: "unavailable" | "rate_limited" | "invalid_response"; message: string }
  | { type: "MANUAL_ENTRY" }
  | { type: "DRAFT_EDITED"; field: "amountSol" | "recipient"; value: string }
  | { type: "WALLET_CHANGED"; address: string | null }
  | { type: "CHECKS_INVALIDATED"; message: string }
  | { type: "INTENT_APPROVED"; intent: ApprovedIntent }
  | { type: "BUILD_SUCCEEDED"; approvalId: string; prepared: PreparedTransfer; context: VerificationContext }
  | { type: "VERIFICATION_COMPLETED"; approvalId: string; result: VerificationResult }
  | { type: "SIMULATION_STARTED"; approvalId: string }
  | { type: "SIMULATION_COMPLETED"; approvalId: string; result: SimulationResult }
  | { type: "PIPELINE_UNABLE"; approvalId: string; code: string; message: string }
  | { type: "SIGN_REQUESTED"; approvalId: string }
  | { type: "SIGN_FAILED"; approvalId: string; code: string; message: string }
  | { type: "SIGNED"; approvalId: string; signed: SignedTransfer }
  | { type: "BROADCAST_STARTED"; approvalId: string; submittedAt: number }
  | { type: "SUBMIT_RESOLVED"; approvalId: string; outcome: SubmitOutcome; submittedAt: number }
  | { type: "CONFIRMATION_UPDATED"; approvalId: string; interpretation: StatusInterpretation; details?: Partial<Pick<TransactionReceipt, "blockTime" | "feeLamports">> }
  | { type: "RECEIPT_DETAILS_LOADED"; signature: string; blockTime: bigint | null; feeLamports: bigint | null }
  | { type: "LIFETIME_EXPIRED"; approvalId: string }
  | { type: "REVIEW_AGAIN" }
  | { type: "RESET" };

const EMPTY_DRAFT: DraftState = { amountSol: "", recipient: "", source: "manual" };

export function createInitialState(walletAddress: string | null = null): MachineState {
  return {
    status: "IDLE",
    parseRequestId: null,
    composerText: "",
    draft: EMPTY_DRAFT,
    aiNotice: null,
    walletAddress,
    approvedIntent: null,
    prepared: null,
    verification: null,
    simulation: null,
    signRequestedFor: [],
    signed: null,
    receipt: null,
    error: null,
    notice: null,
    networkContext: null,
  };
}

/** States where the draft/approval may still be edited or re-approved. */
const PRE_SIGN: ReadonlySet<TransferStatus> = new Set([
  "IDLE",
  "PARSING_INTENT",
  "NEEDS_INPUT",
  "AI_UNAVAILABLE",
  "DRAFT_READY",
  "INTENT_APPROVED",
  "BUILDING",
  "VERIFYING",
  "BLOCKED",
  "UNABLE_TO_VERIFY",
  "SIMULATING",
  "SIMULATION_FAILED",
  "READY_TO_SIGN",
  "WALLET_REJECTED",
  "SUBMIT_FAILED",
]);

/** After a broadcast attempt the receipt must stay visible until an explicit reset. */
const POST_SUBMIT: ReadonlySet<TransferStatus> = new Set([
  "SUBMITTED",
  "CONFIRMING",
  "CONFIRMED",
  "ONCHAIN_FAILED",
  "EXPIRED",
  "UNKNOWN",
]);

export function isPostSubmit(status: TransferStatus): boolean {
  return POST_SUBMIT.has(status);
}

export function isDraftEditable(status: TransferStatus): boolean {
  return PRE_SIGN.has(status) && status !== "PARSING_INTENT";
}

/** Which draft-level status the current values imply. */
function draftStatus(draft: DraftState, walletAddress: string | null, aiNotice: AiNotice | null): TransferStatus {
  if (validateDraft(draft, walletAddress).ok) return "DRAFT_READY";
  if (aiNotice?.kind === "unavailable" || aiNotice?.kind === "rate_limited") return "AI_UNAVAILABLE";
  if (aiNotice?.kind === "needs_input" || aiNotice?.kind === "unsupported") return "NEEDS_INPUT";
  return "IDLE";
}

/**
 * Drop the approval and every derived artifact. Async pipeline events are keyed
 * by approvalId, so clearing the approval makes all in-flight results stale.
 */
function invalidate(state: MachineState, patch: Partial<MachineState> = {}): MachineState {
  const next: MachineState = {
    ...state,
    approvedIntent: null,
    prepared: null,
    verification: null,
    simulation: null,
    signed: null,
    receipt: null,
    error: null,
    networkContext: null,
    ...patch,
  };
  return { ...next, status: patch.status ?? draftStatus(next.draft, next.walletAddress, next.aiNotice) };
}

function stale(state: MachineState, approvalId: string): boolean {
  return state.approvedIntent?.approvalId !== approvalId;
}

/** Selector used by the UI and by the reducer's SIGN_REQUESTED guard. */
export function canRequestSignature(state: MachineState): boolean {
  if (state.status !== "READY_TO_SIGN" || !state.approvedIntent) return false;
  if (state.signRequestedFor.includes(state.approvedIntent.approvalId)) return false;
  if (!state.walletAddress || state.walletAddress !== state.approvedIntent.sender) return false;
  return isSigningGateOpen({
    intent: state.approvedIntent,
    prepared: state.prepared,
    verification: state.verification,
    simulation: state.simulation,
  });
}

function receiptFrom(
  state: MachineState,
  signature: string,
  status: TransactionReceipt["status"],
  submittedAt: number,
  error: string | null,
): TransactionReceipt | null {
  if (!state.approvedIntent) return null;
  return {
    status,
    signature,
    amountLamports: state.approvedIntent.amountLamports,
    sender: state.approvedIntent.sender,
    recipient: state.approvedIntent.recipient,
    cluster: "devnet",
    submittedAt,
    confirmationStatus: null,
    slot: null,
    error,
    blockTime: null,
    estimatedFeeLamports: state.simulation?.feeLamports ?? null,
    feeLamports: null,
  };
}

const RECEIPT_TO_STATUS: Record<TransactionReceipt["status"], TransferStatus> = {
  submitted: "SUBMITTED",
  confirming: "CONFIRMING",
  confirmed: "CONFIRMED",
  onchain_failed: "ONCHAIN_FAILED",
  expired: "EXPIRED",
  unknown: "UNKNOWN",
};

export function transferReducer(state: MachineState, event: TransferEvent): MachineState {
  switch (event.type) {
    case "COMPOSER_CHANGED": {
      if (!isDraftEditable(state.status)) return state;
      if (state.composerText === event.text) return state;
      return invalidate(state, {
        composerText: event.text,
        draft: EMPTY_DRAFT,
        aiNotice: null,
        parseRequestId: null,
        notice: state.approvedIntent ? "Your request changed. The previous draft, approval and checks were discarded." : null,
      });
    }

    case "PARSE_STARTED": {
      if (!isDraftEditable(state.status)) return state;
      return invalidate(state, {
        status: "PARSING_INTENT",
        parseRequestId: event.requestId,
        draft: EMPTY_DRAFT,
        aiNotice: null,
        notice: null,
      });
    }

    case "PARSE_SUCCEEDED": {
      if (state.status !== "PARSING_INTENT" || state.parseRequestId !== event.requestId) return state;
      const { response } = event;
      const draft: DraftState = {
        amountSol: response.draft.amountSol ?? "",
        recipient: response.draft.recipient ?? "",
        source: "ai",
      };
      const model = response.meta ? { model: response.meta } : {};
      const aiNotice: AiNotice =
        response.status === "complete"
          ? {
              kind: "parsed",
              message: "Draft prepared from your request. Review every field before approving.",
              explanation: response.explanation,
              ...model,
            }
          : response.status === "unsupported"
            ? {
                kind: "unsupported",
                message: "Only native SOL transfers on Devnet are supported. No transaction was prepared.",
                explanation: response.explanation,
                ...model,
              }
            : {
                kind: "needs_input",
                message: response.missingFields.includes("recipient")
                  ? "Paste the recipient's full Solana address. We won't guess it."
                  : "Enter an exact amount in SOL.",
                explanation: response.explanation,
                missingFields: response.missingFields,
                ...model,
              };
      const next = {
        ...state,
        parseRequestId: null,
        draft: response.status === "unsupported" ? EMPTY_DRAFT : draft,
        aiNotice,
      };
      return {
        ...next,
        // An incomplete/unsupported parse is never an approval-ready result,
        // even if an inconsistent response happens to contain valid fields.
        status: response.status === "complete" ? draftStatus(next.draft, next.walletAddress, aiNotice) : "NEEDS_INPUT",
      };
    }

    case "PARSE_FAILED": {
      if (state.status !== "PARSING_INTENT" || state.parseRequestId !== event.requestId) return state;
      const aiNotice: AiNotice = {
        kind: event.kind === "rate_limited" ? "rate_limited" : "unavailable",
        message: event.message,
      };
      return {
        ...state,
        parseRequestId: null,
        aiNotice,
        draft: { ...state.draft, source: "manual" },
        status: "AI_UNAVAILABLE",
      };
    }

    case "MANUAL_ENTRY": {
      if (!isDraftEditable(state.status)) return state;
      return invalidate(state, { draft: { ...state.draft, source: "manual" } });
    }

    case "DRAFT_EDITED": {
      if (!isDraftEditable(state.status)) return state;
      if (state.draft[event.field] === event.value) return state;
      const hadApproval = state.approvedIntent !== null;
      return invalidate(state, {
        draft: { ...state.draft, [event.field]: event.value, source: "manual" },
        notice: hadApproval ? "You edited the transfer, so the previous approval and checks were discarded." : state.notice,
      });
    }

    case "WALLET_CHANGED": {
      if (event.address === state.walletAddress) return state;
      if (isPostSubmit(state.status)) return { ...state, walletAddress: event.address };
      const hadApproval = state.approvedIntent !== null || state.status === "AWAITING_WALLET";
      return invalidate(
        { ...state, walletAddress: event.address },
        {
          notice: hadApproval
            ? event.address
              ? "Wallet changed — the previous approval and checks were cleared. Review and approve again."
              : "Wallet disconnected — the previous approval was cleared."
            : null,
        },
      );
    }

    case "CHECKS_INVALIDATED": {
      if (isPostSubmit(state.status)) return state;
      return invalidate(state, { notice: event.message });
    }

    case "INTENT_APPROVED": {
      if (state.status !== "DRAFT_READY") return state;
      if (!state.walletAddress || event.intent.sender !== state.walletAddress) return state;
      const validation = validateDraft(state.draft, state.walletAddress);
      if (
        !validation.ok ||
        validation.value.amountLamports !== event.intent.amountLamports ||
        validation.value.recipient !== event.intent.recipient
      ) {
        return state;
      }
      return {
        ...invalidate(state, { status: "BUILDING", notice: null }),
        approvedIntent: event.intent,
      };
    }

    case "BUILD_SUCCEEDED": {
      if (stale(state, event.approvalId) || state.status !== "BUILDING") return state;
      return { ...state, status: "VERIFYING", prepared: event.prepared, networkContext: event.context };
    }

    case "VERIFICATION_COMPLETED": {
      if (stale(state, event.approvalId) || state.status !== "VERIFYING") return state;
      const result = event.result;
      if (result.status === "unable_to_verify") {
        return {
          ...state,
          status: "UNABLE_TO_VERIFY",
          verification: result,
          error: { code: "UNABLE_TO_VERIFY", message: "The prepared transaction could not be verified. Signing is disabled." },
        };
      }
      if (!result.ok) {
        return {
          ...state,
          status: "BLOCKED",
          verification: result,
          error: { code: "VERIFICATION_BLOCKED", message: "Verification failed. Signing is disabled." },
        };
      }
      return { ...state, verification: result };
    }

    case "SIMULATION_STARTED": {
      if (stale(state, event.approvalId) || state.status !== "VERIFYING" || !state.verification?.ok) return state;
      return { ...state, status: "SIMULATING" };
    }

    case "SIMULATION_COMPLETED": {
      if (stale(state, event.approvalId) || state.status !== "SIMULATING") return state;
      const result = event.result;
      if (result.status === "unavailable" || result.status === "timeout") {
        return {
          ...state,
          status: "UNABLE_TO_VERIFY",
          simulation: result,
          error: { code: result.errorCode ?? "RPC_UNAVAILABLE", message: result.error ?? "Unable to verify." },
        };
      }
      if (!result.ok) {
        return {
          ...state,
          status: "SIMULATION_FAILED",
          simulation: result,
          error: { code: result.errorCode ?? "SIMULATION_FAILED", message: result.error ?? "Simulation failed." },
        };
      }
      const next = { ...state, simulation: result };
      const gateOpen = isSigningGateOpen({
        intent: next.approvedIntent,
        prepared: next.prepared,
        verification: next.verification,
        simulation: next.simulation,
      });
      return gateOpen
        ? { ...next, status: "READY_TO_SIGN", error: null }
        : {
            ...next,
            status: "UNABLE_TO_VERIFY",
            error: { code: "GATE_INCONSISTENT", message: "Checks did not line up with the prepared message. Signing is disabled." },
          };
    }

    case "PIPELINE_UNABLE": {
      if (stale(state, event.approvalId)) return state;
      if (!["BUILDING", "VERIFYING", "SIMULATING"].includes(state.status)) return state;
      return { ...state, status: "UNABLE_TO_VERIFY", error: { code: event.code, message: event.message } };
    }

    case "SIGN_REQUESTED": {
      if (stale(state, event.approvalId) || !canRequestSignature(state)) return state;
      return {
        ...state,
        status: "AWAITING_WALLET",
        signRequestedFor: [...state.signRequestedFor, event.approvalId],
        error: null,
        notice: null,
      };
    }

    case "SIGN_FAILED": {
      if (stale(state, event.approvalId) || state.status !== "AWAITING_WALLET") return state;
      const blocked = event.code === "MESSAGE_CHANGED" || event.code === "SIGNATURE_INVALID" || event.code === "UNEXPECTED_OUTPUT" || event.code === "SIGNATURE_MISSING" || event.code === "SIGNATURE_UNVERIFIABLE" || event.code === "GATE_CLOSED";
      return {
        ...state,
        status: blocked ? "BLOCKED" : "WALLET_REJECTED",
        error: { code: event.code, message: event.message },
      };
    }

    case "SIGNED": {
      if (stale(state, event.approvalId) || state.status !== "AWAITING_WALLET") return state;
      return { ...state, signed: event.signed };
    }

    case "BROADCAST_STARTED": {
      if (stale(state, event.approvalId) || state.status !== "AWAITING_WALLET" || !state.signed) return state;
      return {
        ...state,
        status: "CONFIRMING",
        receipt: receiptFrom(state, state.signed.signature, "confirming", event.submittedAt, null),
        notice: "Sending the signed transaction. Its signature will remain available if the connection changes.",
      };
    }

    case "SUBMIT_RESOLVED": {
      if (stale(state, event.approvalId) || !["AWAITING_WALLET", "CONFIRMING"].includes(state.status) || !state.signed) return state;
      const { outcome } = event;
      switch (outcome.kind) {
        case "submitted":
          return {
            ...state,
            status: "SUBMITTED",
            receipt: receiptFrom(state, outcome.signature, "submitted", event.submittedAt, null),
          };
        case "unknown":
          return {
            ...state,
            status: "CONFIRMING",
            receipt: receiptFrom(state, outcome.signature, "confirming", event.submittedAt, null),
            notice: outcome.message,
          };
        case "expired":
          return { ...state, status: "SUBMIT_FAILED", receipt: null, error: { code: "EXPIRED_BEFORE_BROADCAST", message: outcome.message } };
        case "rejected":
          return { ...state, status: "SUBMIT_FAILED", receipt: null, error: { code: outcome.code, message: outcome.message } };
      }
      return state;
    }

    case "CONFIRMATION_UPDATED": {
      if (stale(state, event.approvalId) || !state.receipt) return state;
      if (!["SUBMITTED", "CONFIRMING"].includes(state.status)) return state;
      const { interpretation } = event;
      const receipt: TransactionReceipt = {
        ...state.receipt,
        status: interpretation.status,
        confirmationStatus: interpretation.confirmationStatus,
        slot: interpretation.slot,
        error: interpretation.error,
        ...(event.details?.blockTime !== undefined ? { blockTime: event.details.blockTime } : {}),
        ...(event.details?.feeLamports !== undefined ? { feeLamports: event.details.feeLamports } : {}),
      };
      return { ...state, receipt, status: RECEIPT_TO_STATUS[interpretation.status] };
    }

    case "RECEIPT_DETAILS_LOADED": {
      if (!state.receipt || state.receipt.signature !== event.signature) return state;
      return { ...state, receipt: { ...state.receipt, blockTime: event.blockTime, feeLamports: event.feeLamports } };
    }

    case "LIFETIME_EXPIRED": {
      if (stale(state, event.approvalId) || !["READY_TO_SIGN", "AWAITING_WALLET"].includes(state.status) || state.signed) return state;
      return invalidate(state, {
        notice: "The prepared transaction expired before signing. Review and approve again to build a fresh one.",
      });
    }

    case "REVIEW_AGAIN": {
      if (
        ![
          "BLOCKED",
          "UNABLE_TO_VERIFY",
          "SIMULATION_FAILED",
          "WALLET_REJECTED",
          "SUBMIT_FAILED",
          "EXPIRED",
          "ONCHAIN_FAILED",
          "UNKNOWN",
        ].includes(state.status)
      ) {
        return state;
      }
      return invalidate(state, { notice: null });
    }

    case "RESET": {
      return createInitialState(state.walletAddress);
    }
  }
}
