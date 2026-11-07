import { describe, expect, it } from "vitest";
import { approveIntent } from "@/features/intent/lib/intent-validation";
import type { ApprovedIntent } from "@/features/intent/types";
import { buildNativeSolTransfer } from "@/features/transfer/lib/build-transfer";
import { interpretSignatureStatus } from "@/features/transfer/lib/confirm-transfer";
import {
  canRequestSignature,
  createInitialState,
  transferReducer,
  type MachineState,
  type TransferEvent,
} from "@/features/transfer/machine";
import type { SimulationResult } from "@/features/transfer/types";
import { verifyNativeSolTransfer } from "@/features/verification/lib/verify-native-sol-transfer";
import { DEVNET_CONTEXT, OTHER, RECIPIENT, SENDER, TEST_BLOCKHASH } from "@/test/fixtures/solana";

const reduce = (state: MachineState, ...events: TransferEvent[]) => events.reduce(transferReducer, state);

function draftReady(): MachineState {
  return reduce(
    createInitialState(SENDER),
    { type: "DRAFT_EDITED", field: "amountSol", value: "0.1" },
    { type: "DRAFT_EDITED", field: "recipient", value: RECIPIENT },
  );
}

function approved(state = draftReady()): { state: MachineState; intent: ApprovedIntent } {
  const result = approveIntent(state.draft, state.walletAddress);
  if (!result.ok) throw new Error("approval failed");
  return { state: transferReducer(state, { type: "INTENT_APPROVED", intent: result.intent }), intent: result.intent };
}

function passedSimulation(fingerprint: string): SimulationResult {
  return {
    ok: true,
    status: "passed",
    error: null,
    errorCode: null,
    logs: [],
    feeLamports: 5_000n,
    simulatedFingerprint: fingerprint,
    checkedAt: 1,
  };
}

/** Drive a fresh approval all the way to READY_TO_SIGN with real build + verify. */
function readyToSign(): { state: MachineState; intent: ApprovedIntent } {
  const { state, intent } = approved();
  const prepared = buildNativeSolTransfer(intent, { blockhash: TEST_BLOCKHASH as string, lastValidBlockHeight: 1_000n });
  const verification = verifyNativeSolTransfer({ intent, messageBytes: prepared.messageBytes, context: DEVNET_CONTEXT });
  const next = reduce(
    state,
    { type: "BUILD_SUCCEEDED", approvalId: intent.approvalId, prepared, context: DEVNET_CONTEXT },
    { type: "VERIFICATION_COMPLETED", approvalId: intent.approvalId, result: verification },
    { type: "SIMULATION_STARTED", approvalId: intent.approvalId },
    { type: "SIMULATION_COMPLETED", approvalId: intent.approvalId, result: passedSimulation(prepared.fingerprint) },
  );
  return { state: next, intent };
}

describe("transfer state machine (PRD §7)", () => {
  it("starts IDLE and reaches DRAFT_READY only with valid fields", () => {
    expect(createInitialState().status).toBe("IDLE");
    const partial = reduce(createInitialState(SENDER), { type: "DRAFT_EDITED", field: "amountSol", value: "0.1" });
    expect(partial.status).toBe("IDLE");
    expect(draftReady().status).toBe("DRAFT_READY");
  });

  it("FR-001: approval is impossible without a connected wallet", () => {
    const noWallet = reduce(
      createInitialState(null),
      { type: "DRAFT_EDITED", field: "amountSol", value: "0.1" },
      { type: "DRAFT_EDITED", field: "recipient", value: RECIPIENT },
    );
    const forged = approveIntent(noWallet.draft, SENDER);
    if (!forged.ok) throw new Error("unexpected");
    expect(transferReducer(noWallet, { type: "INTENT_APPROVED", intent: forged.intent }).status).toBe("DRAFT_READY");
    expect(canRequestSignature(noWallet)).toBe(false);
  });

  it("reaches READY_TO_SIGN only when verification AND simulation pass", () => {
    const { state } = readyToSign();
    expect(state.status).toBe("READY_TO_SIGN");
    expect(canRequestSignature(state)).toBe(true);
  });

  it("UT-08/09 path: a blocked verification never reaches READY_TO_SIGN", () => {
    const { state, intent } = approved();
    const tampered = buildNativeSolTransfer(
      { ...intent, amountLamports: 800_000_000n },
      { blockhash: TEST_BLOCKHASH as string, lastValidBlockHeight: 1_000n },
    );
    const result = verifyNativeSolTransfer({ intent, messageBytes: tampered.messageBytes, context: DEVNET_CONTEXT });
    const next = reduce(
      state,
      { type: "BUILD_SUCCEEDED", approvalId: intent.approvalId, prepared: tampered, context: DEVNET_CONTEXT },
      { type: "VERIFICATION_COMPLETED", approvalId: intent.approvalId, result },
      { type: "SIMULATION_STARTED", approvalId: intent.approvalId },
    );
    expect(next.status).toBe("BLOCKED");
    expect(canRequestSignature(next)).toBe(false);
    expect(reduce(next, { type: "SIGN_REQUESTED", approvalId: intent.approvalId }).status).toBe("BLOCKED");
  });

  it("UT-14: RPC error / simulation err keeps signing disabled", () => {
    const { state, intent } = approved();
    const prepared = buildNativeSolTransfer(intent, { blockhash: TEST_BLOCKHASH as string, lastValidBlockHeight: 1_000n });
    const verification = verifyNativeSolTransfer({ intent, messageBytes: prepared.messageBytes, context: DEVNET_CONTEXT });
    const base = reduce(
      state,
      { type: "BUILD_SUCCEEDED", approvalId: intent.approvalId, prepared, context: DEVNET_CONTEXT },
      { type: "VERIFICATION_COMPLETED", approvalId: intent.approvalId, result: verification },
      { type: "SIMULATION_STARTED", approvalId: intent.approvalId },
    );
    const failed = transferReducer(base, {
      type: "SIMULATION_COMPLETED",
      approvalId: intent.approvalId,
      result: { ...passedSimulation(prepared.fingerprint), ok: false, status: "failed", error: "boom", errorCode: "X" },
    });
    expect(failed.status).toBe("SIMULATION_FAILED");
    expect(canRequestSignature(failed)).toBe(false);

    const unavailable = transferReducer(base, {
      type: "SIMULATION_COMPLETED",
      approvalId: intent.approvalId,
      result: { ...passedSimulation(prepared.fingerprint), ok: false, status: "unavailable", error: "down", errorCode: "RPC_UNAVAILABLE" },
    });
    expect(unavailable.status).toBe("UNABLE_TO_VERIFY");
    expect(canRequestSignature(unavailable)).toBe(false);

    const unable = transferReducer(state, {
      type: "PIPELINE_UNABLE",
      approvalId: intent.approvalId,
      code: "RPC_UNAVAILABLE",
      message: "down",
    });
    expect(unable.status).toBe("UNABLE_TO_VERIFY");
  });

  it("refuses READY_TO_SIGN if the simulated bytes differ from the verified bytes", () => {
    const { state, intent } = approved();
    const prepared = buildNativeSolTransfer(intent, { blockhash: TEST_BLOCKHASH as string, lastValidBlockHeight: 1_000n });
    const verification = verifyNativeSolTransfer({ intent, messageBytes: prepared.messageBytes, context: DEVNET_CONTEXT });
    const next = reduce(
      state,
      { type: "BUILD_SUCCEEDED", approvalId: intent.approvalId, prepared, context: DEVNET_CONTEXT },
      { type: "VERIFICATION_COMPLETED", approvalId: intent.approvalId, result: verification },
      { type: "SIMULATION_STARTED", approvalId: intent.approvalId },
      { type: "SIMULATION_COMPLETED", approvalId: intent.approvalId, result: passedSimulation("sha256:other") },
    );
    expect(next.status).toBe("UNABLE_TO_VERIFY");
  });

  it("FR-004: editing one digit after approval discards approval and all checks", () => {
    const { state } = readyToSign();
    const edited = transferReducer(state, { type: "DRAFT_EDITED", field: "amountSol", value: "0.2" });
    expect(edited.status).toBe("DRAFT_READY");
    expect(edited.approvedIntent).toBeNull();
    expect(edited.verification).toBeNull();
    expect(edited.simulation).toBeNull();
    expect(edited.notice).toMatch(/discarded/);
  });

  it("ignores stale async results after the approval changed", () => {
    const { state, intent } = approved();
    const edited = transferReducer(state, { type: "DRAFT_EDITED", field: "recipient", value: OTHER });
    const prepared = buildNativeSolTransfer(intent, { blockhash: TEST_BLOCKHASH as string, lastValidBlockHeight: 1_000n });
    const after = transferReducer(edited, { type: "BUILD_SUCCEEDED", approvalId: intent.approvalId, prepared, context: DEVNET_CONTEXT });
    expect(after).toBe(edited);
  });

  it("UT-19: duplicate sign clicks produce at most one signing request per approval", () => {
    const { state, intent } = readyToSign();
    const first = transferReducer(state, { type: "SIGN_REQUESTED", approvalId: intent.approvalId });
    expect(first.status).toBe("AWAITING_WALLET");
    const second = transferReducer(first, { type: "SIGN_REQUESTED", approvalId: intent.approvalId });
    expect(second).toBe(first);
    expect(second.signRequestedFor).toEqual([intent.approvalId]);
  });

  it("UT-16: wallet rejection → WALLET_REJECTED, nothing submitted, review again requires re-approval", () => {
    const { state, intent } = readyToSign();
    const rejected = reduce(
      state,
      { type: "SIGN_REQUESTED", approvalId: intent.approvalId },
      { type: "SIGN_FAILED", approvalId: intent.approvalId, code: "WALLET_REJECTED", message: "rejected" },
    );
    expect(rejected.status).toBe("WALLET_REJECTED");
    expect(rejected.receipt).toBeNull();
    expect(rejected.signed).toBeNull();
    // The same approval can never be signed again.
    expect(canRequestSignature(rejected)).toBe(false);
    const again = transferReducer(rejected, { type: "REVIEW_AGAIN" });
    expect(again.status).toBe("DRAFT_READY");
    expect(again.approvedIntent).toBeNull();
  });

  it("sign-boundary mutation is a BLOCK, not a rejection", () => {
    const { state, intent } = readyToSign();
    const blocked = reduce(
      state,
      { type: "SIGN_REQUESTED", approvalId: intent.approvalId },
      { type: "SIGN_FAILED", approvalId: intent.approvalId, code: "MESSAGE_CHANGED", message: "changed" },
    );
    expect(blocked.status).toBe("BLOCKED");
  });

  it("UT-20: wallet or network change invalidates prior verification", () => {
    const { state } = readyToSign();
    const switched = transferReducer(state, { type: "WALLET_CHANGED", address: OTHER });
    expect(switched.approvedIntent).toBeNull();
    expect(switched.verification).toBeNull();
    expect(switched.walletAddress).toBe(OTHER);
    expect(canRequestSignature(switched)).toBe(false);
    const disconnected = transferReducer(state, { type: "WALLET_CHANGED", address: null });
    expect(disconnected.approvedIntent).toBeNull();
    expect(disconnected.notice).toMatch(/disconnected/i);
  });

  it("blockhash expiry before signing forces rebuild + re-approval", () => {
    const { state, intent } = readyToSign();
    const expired = transferReducer(state, { type: "LIFETIME_EXPIRED", approvalId: intent.approvalId });
    expect(expired.status).toBe("DRAFT_READY");
    expect(expired.approvedIntent).toBeNull();
    expect(expired.notice).toMatch(/expired/);
  });

  it("UT-17: SUBMITTED is not CONFIRMED; confirmation requires RPC evidence", () => {
    const { state, intent } = readyToSign();
    const signedState = reduce(
      state,
      { type: "SIGN_REQUESTED", approvalId: intent.approvalId },
      {
        type: "SIGNED",
        approvalId: intent.approvalId,
        signed: { signature: "sig", wireBase64: "AA==", signedMessageFingerprint: "sha256:x", signedAt: 2 },
      },
      { type: "SUBMIT_RESOLVED", approvalId: intent.approvalId, outcome: { kind: "submitted", signature: "sig" }, submittedAt: 3 },
    );
    expect(signedState.status).toBe("SUBMITTED");
    expect(signedState.receipt?.status).toBe("submitted");

    const processed = transferReducer(signedState, {
      type: "CONFIRMATION_UPDATED",
      approvalId: intent.approvalId,
      interpretation: interpretSignatureStatus({ confirmationStatus: "processed", err: null, slot: 5n }, null, 1_000n),
    });
    expect(processed.status).toBe("CONFIRMING");

    const confirmed = transferReducer(processed, {
      type: "CONFIRMATION_UPDATED",
      approvalId: intent.approvalId,
      interpretation: interpretSignatureStatus({ confirmationStatus: "confirmed", err: null, slot: 6n }, null, 1_000n),
    });
    expect(confirmed.status).toBe("CONFIRMED");
    expect(confirmed.receipt?.status).toBe("confirmed");
  });

  it("UT-18: meta.err not null → ONCHAIN_FAILED", () => {
    expect(
      interpretSignatureStatus({ confirmationStatus: "confirmed", err: { InstructionError: [0, { Custom: 1 }] }, slot: 1n }, null, 10n)
        .status,
    ).toBe("onchain_failed");
  });

  it("maps unseen signature past lastValidBlockHeight to expired, before that to confirming", () => {
    expect(interpretSignatureStatus(null, 11n, 10n).status).toBe("expired");
    expect(interpretSignatureStatus(null, 9n, 10n).status).toBe("confirming");
    expect(interpretSignatureStatus(null, null, 10n).status).toBe("confirming");
  });

  it("an RPC-rejected broadcast is SUBMIT_FAILED, never a success", () => {
    const { state, intent } = readyToSign();
    const failed = reduce(
      state,
      { type: "SIGN_REQUESTED", approvalId: intent.approvalId },
      {
        type: "SIGNED",
        approvalId: intent.approvalId,
        signed: { signature: "sig", wireBase64: "AA==", signedMessageFingerprint: "sha256:x", signedAt: 2 },
      },
      {
        type: "SUBMIT_RESOLVED",
        approvalId: intent.approvalId,
        outcome: { kind: "rejected", code: "INSUFFICIENT_LAMPORTS", message: "no funds" },
        submittedAt: 3,
      },
    );
    expect(failed.status).toBe("SUBMIT_FAILED");
    expect(failed.receipt).toBeNull();
  });

  it("locks the draft while waiting for the wallet and after submission", () => {
    const { state, intent } = readyToSign();
    const awaiting = transferReducer(state, { type: "SIGN_REQUESTED", approvalId: intent.approvalId });
    expect(transferReducer(awaiting, { type: "DRAFT_EDITED", field: "amountSol", value: "0.9" })).toBe(awaiting);
  });

  it("AI parse results are applied only for the latest request id", () => {
    const started = transferReducer(createInitialState(SENDER), { type: "PARSE_STARTED", requestId: "b" });
    const stale = transferReducer(started, {
      type: "PARSE_SUCCEEDED",
      requestId: "a",
      response: { status: "complete", draft: { action: "transfer_native_sol", amountSol: "0.5", recipient: RECIPIENT }, missingFields: [], explanation: "" },
    });
    expect(stale).toBe(started);
    const fresh = transferReducer(started, {
      type: "PARSE_SUCCEEDED",
      requestId: "b",
      response: { status: "complete", draft: { action: "transfer_native_sol", amountSol: "0.5", recipient: RECIPIENT }, missingFields: [], explanation: "" },
    });
    expect(fresh.status).toBe("DRAFT_READY");
    expect(fresh.draft).toMatchObject({ amountSol: "0.5", recipient: RECIPIENT, source: "ai" });
    expect(fresh.approvedIntent).toBeNull();
  });

  it("AI model attribution is display-only: it changes neither the draft rules nor approval", () => {
    const response = {
      status: "complete" as const,
      draft: { action: "transfer_native_sol" as const, amountSol: "0.5", recipient: RECIPIENT },
      missingFields: [],
      explanation: "",
    };
    const started = transferReducer(createInitialState(SENDER), { type: "PARSE_STARTED", requestId: "m" });
    const viaDefault = transferReducer(started, { type: "PARSE_SUCCEEDED", requestId: "m", response });
    const viaFallback = transferReducer(started, {
      type: "PARSE_SUCCEEDED",
      requestId: "m",
      response: { ...response, meta: { model: "a/one", requestedModel: "b/two", fallbackUsed: true } },
    });
    expect(viaFallback.aiNotice?.model).toEqual({ model: "a/one", requestedModel: "b/two", fallbackUsed: true });
    // Same draft, same status, still no approval, no verification — whichever model answered.
    expect(viaFallback.draft).toEqual(viaDefault.draft);
    expect(viaFallback.status).toBe(viaDefault.status);
    expect(viaFallback.approvedIntent).toBeNull();
    expect(viaFallback.verification).toBeNull();
  });

  it("AI failure moves to AI_UNAVAILABLE with manual fallback copy", () => {
    const started = transferReducer(createInitialState(SENDER), { type: "PARSE_STARTED", requestId: "x" });
    const failed = transferReducer(started, {
      type: "PARSE_FAILED",
      requestId: "x",
      kind: "unavailable",
      message: "AI help is offline. Enter the transfer details manually.",
    });
    expect(failed.status).toBe("AI_UNAVAILABLE");
    expect(failed.aiNotice?.message).toContain("manually");
  });
});
