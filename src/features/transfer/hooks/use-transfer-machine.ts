"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { approveIntent, type DraftFieldErrors } from "@/features/intent/lib/intent-validation";
import { requestIntentParse } from "@/features/intent/lib/parse-intent-client";
import { forgetTransactionSignature, rememberTransactionSignature } from "@/features/receipt/lib/transaction-recovery";
import { useConnectedWallet } from "@/features/wallet/hooks/use-connected-wallet";
import { useProductContext } from "@/features/wallet/product-context";
import { getRpcPort } from "@/lib/solana/client";
import { waitForConfirmation } from "../lib/confirm-transfer";
import { runPreSignPipeline } from "../lib/prepare-transfer";
import { SignBoundaryError, signVerifiedTransfer, type TransactionSignerPort } from "../lib/sign-transfer";
import { createSigningLock } from "../lib/signing-lock";
import { submitSignedTransfer } from "../lib/submit-transfer";
import { canRequestSignature, createInitialState, isDraftEditable, transferReducer, type MachineState, type TransferEvent } from "../machine";

function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export type SignAvailability =
  | { ok: true }
  | { ok: false; reason: string };

type SigningOperation = {
  approvalId: string;
  sender: string;
  signer: TransactionSignerPort;
  controller: AbortController;
  broadcastAttempted: boolean;
};

/**
 * Orchestrates the real transfer workflow around the pure reducer:
 * AI parse → explicit approval → pre-sign pipeline → wallet sign boundary →
 * single broadcast → confirmation polling.
 */
export function useTransferMachine() {
  const wallet = useConnectedWallet();
  const { devnet, online, recheckDevnet } = useProductContext();
  const [state, reactDispatch] = useReducer(transferReducer, null, () => createInitialState(null));
  const [approvalErrors, setApprovalErrors] = useState<DraftFieldErrors | { sender: string } | null>(null);

  const stateRef = useRef<MachineState>(state);
  const lockRef = useRef(createSigningLock());
  const parseAbort = useRef<AbortController | null>(null);
  const pipelineAbort = useRef<AbortController | null>(null);
  const signAbort = useRef<AbortController | null>(null);
  const operationRef = useRef<SigningOperation | null>(null);
  const runtimeRef = useRef({ address: wallet.address, signer: wallet.signer, supportsDevnet: wallet.supportsDevnet, online, networkVerified: devnet.state === "verified" });

  // State transitions are synchronous for orchestration as well as queued for React.
  // Ignoring a stale reducer event alone must never allow a wallet side effect.
  const dispatch = useCallback((event: TransferEvent) => {
    stateRef.current = transferReducer(stateRef.current, event);
    reactDispatch(event);
  }, []);

  const cancelPreBroadcast = useCallback(() => {
    pipelineAbort.current?.abort();
    const operation = operationRef.current;
    if (operation && !operation.broadcastAttempted) {
      operation.controller.abort();
      // Wallets may ignore AbortSignal and keep their popup promise pending.
      // Retain the used approval id, but do not block a different approval.
      lockRef.current.release(operation.approvalId);
      operationRef.current = null;
    }
  }, []);

  useEffect(() => {
    runtimeRef.current = { address: wallet.address, signer: wallet.signer, supportsDevnet: wallet.supportsDevnet, online, networkVerified: devnet.state === "verified" };
    const operation = operationRef.current;
    const changed = stateRef.current.walletAddress !== wallet.address;
    if (changed) {
      parseAbort.current?.abort();
      if (stateRef.current.status === "PARSING_INTENT") dispatch({ type: "PARSE_CANCELLED" });
      cancelPreBroadcast();
    }
    dispatch({ type: "WALLET_CHANGED", address: wallet.address });
    if (operation && !operation.broadcastAttempted &&
      (operation.sender !== wallet.address || operation.signer !== wallet.signer || !wallet.supportsDevnet || !online || devnet.state !== "verified")) {
      cancelPreBroadcast();
      dispatch({ type: "CHECKS_INVALIDATED", message: "The wallet or connection changed. Review and approve again before signing." });
    } else if ((!online || devnet.state !== "verified") && stateRef.current.approvedIntent && !operation?.broadcastAttempted) {
      cancelPreBroadcast();
      dispatch({ type: "CHECKS_INVALIDATED", message: "The network connection changed. Reconnect, then review and approve again." });
    }
  }, [wallet.address, wallet.signer, wallet.supportsDevnet, online, devnet.state, cancelPreBroadcast, dispatch]);

  // Abort everything in flight when the workspace unmounts.
  useEffect(
    () => () => {
      parseAbort.current?.abort();
      pipelineAbort.current?.abort();
      signAbort.current?.abort();
    },
    [],
  );

  // Receipt metadata is independent of signing. Retry briefly when confirmed
  // status arrives before getTransaction is indexed; reset/unmount cancels it.
  const enrichmentSignature = state.receipt && (state.receipt.status === "confirmed" || state.receipt.status === "onchain_failed")
    ? state.receipt.signature : null;
  const metadataComplete = state.receipt?.feeLamports != null && state.receipt?.blockTime != null;
  useEffect(() => {
    if (!enrichmentSignature || metadataComplete) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const load = async () => {
      attempts += 1;
      try {
        const details = await getRpcPort().getTransaction(enrichmentSignature, controller.signal);
        if (controller.signal.aborted) return;
        const receipt = stateRef.current.receipt;
        if (!receipt || receipt.signature !== enrichmentSignature) return;
        if (details) {
          const blockTime = details.blockTime ?? receipt.blockTime;
          const feeLamports = details.fee ?? receipt.feeLamports;
          dispatch({ type: "RECEIPT_DETAILS_LOADED", signature: enrichmentSignature, blockTime, feeLamports });
          if (blockTime !== null && feeLamports !== null) return;
        }
      } catch {
        if (controller.signal.aborted) return;
        // Status is already established. A metadata outage must not downgrade it.
      }
      if (attempts < 3) timer = setTimeout(() => void load(), 1_500);
    };
    void load();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [enrichmentSignature, metadataComplete, dispatch]);

  // Blockhash lifetime watcher while waiting for the user to click Sign.
  const readyApprovalId = state.status === "READY_TO_SIGN" ? (state.approvedIntent?.approvalId ?? null) : null;
  const readyLastValid = state.status === "READY_TO_SIGN" ? (state.prepared?.lifetime.lastValidBlockHeight ?? null) : null;
  useEffect(() => {
    if (!readyApprovalId || readyLastValid === null) return;
    const controller = new AbortController();
    const interval = setInterval(() => {
      getRpcPort()
        .getBlockHeight(controller.signal)
        .then((height) => {
          if (height > readyLastValid) dispatch({ type: "LIFETIME_EXPIRED", approvalId: readyApprovalId });
        })
        .catch(() => undefined);
    }, 10_000);
    return () => {
      clearInterval(interval);
      controller.abort();
    };
  }, [readyApprovalId, readyLastValid, dispatch]);

  const setComposerText = useCallback((text: string) => {
    if (!isDraftEditable(stateRef.current.status) || stateRef.current.composerText === text) return;
    cancelPreBroadcast();
    dispatch({ type: "COMPOSER_CHANGED", text });
  }, [cancelPreBroadcast, dispatch]);
  const editDraft = useCallback((field: "amountSol" | "recipient", value: string) => {
    if (!isDraftEditable(stateRef.current.status) || stateRef.current.draft[field] === value) return;
    cancelPreBroadcast();
    setApprovalErrors(null);
    dispatch({ type: "DRAFT_EDITED", field, value });
  }, [cancelPreBroadcast, dispatch]);
  const enterManually = useCallback(() => {
    if (!isDraftEditable(stateRef.current.status)) return;
    cancelPreBroadcast();
    dispatch({ type: "MANUAL_ENTRY" });
  }, [cancelPreBroadcast, dispatch]);

  /** `model` is the switcher's choice; it only selects who drafts (untrusted). */
  const analyze = useCallback(async (model?: string | null) => {
    if (!isDraftEditable(stateRef.current.status)) return;
    cancelPreBroadcast();
    const text = stateRef.current.composerText;
    parseAbort.current?.abort();
    const controller = new AbortController();
    parseAbort.current = controller;
    const requestId = newRequestId();
    dispatch({ type: "PARSE_STARTED", requestId });
    try {
      const result = await requestIntentParse(text, { signal: controller.signal, model: model ?? null });
      if (controller.signal.aborted) return;
      if (result.ok) dispatch({ type: "PARSE_SUCCEEDED", requestId, response: result.response });
      else
        dispatch({
          type: "PARSE_FAILED",
          requestId,
          kind: result.kind === "rate_limited" ? "rate_limited" : "unavailable",
          message: result.message,
        });
    } catch {
      if (!controller.signal.aborted) {
        dispatch({ type: "PARSE_FAILED", requestId, kind: "unavailable", message: "AI help is offline. Enter the transfer details manually." });
      }
    }
  }, [cancelPreBroadcast, dispatch]);

  const cancelAnalysis = useCallback(() => {
    if (stateRef.current.status !== "PARSING_INTENT") return;
    parseAbort.current?.abort();
    parseAbort.current = null;
    dispatch({ type: "PARSE_CANCELLED" });
  }, [dispatch]);

  const approve = useCallback(async () => {
    const current = stateRef.current;
    if (current.status !== "DRAFT_READY") return;
    if (!online || devnet.state !== "verified") {
      setApprovalErrors({ sender: "The network is not verified as Solana Devnet yet, so nothing can be prepared." });
      return;
    }
    const result = approveIntent(current.draft, wallet.address);
    if (!result.ok) {
      setApprovalErrors(result.errors);
      return;
    }
    setApprovalErrors(null);
    const intent = result.intent;
    dispatch({ type: "INTENT_APPROVED", intent });

    pipelineAbort.current?.abort();
    const controller = new AbortController();
    pipelineAbort.current = controller;
    const approvalId = intent.approvalId;

    const outcome = await runPreSignPipeline(getRpcPort(), intent, {
      signal: controller.signal,
      version: wallet.messageVersion ?? 0,
      onEvent: (event) => {
        if (controller.signal.aborted) return;
        switch (event.type) {
          case "build_succeeded":
            dispatch({ type: "BUILD_SUCCEEDED", approvalId, prepared: event.prepared, context: event.context });
            break;
          case "verification_completed":
            dispatch({ type: "VERIFICATION_COMPLETED", approvalId, result: event.result });
            break;
          case "simulation_started":
            dispatch({ type: "SIMULATION_STARTED", approvalId });
            break;
          case "simulation_completed":
            dispatch({ type: "SIMULATION_COMPLETED", approvalId, result: event.result });
            break;
          default:
            break;
        }
      },
    });
    if (controller.signal.aborted || outcome.kind === "aborted") return;
    if (outcome.kind === "unable_to_verify") {
      dispatch({ type: "PIPELINE_UNABLE", approvalId, code: outcome.code, message: outcome.message });
    }
  }, [devnet.state, online, wallet.address, wallet.messageVersion, dispatch]);

  const signAvailability: SignAvailability = (() => {
    if (!wallet.address) return { ok: false, reason: "Connect a Devnet wallet to continue." };
    if (!online) return { ok: false, reason: "You are offline. Signing is disabled until you reconnect." };
    if (devnet.state !== "verified") return { ok: false, reason: "Verify the connection to Solana Devnet before signing." };
    if (!wallet.supportsDevnet) return { ok: false, reason: "This wallet account does not support Solana Devnet." };
    if (!wallet.signer) return { ok: false, reason: "This wallet cannot sign without broadcasting, so the signed bytes cannot be verified." };
    if (!canRequestSignature(state)) return { ok: false, reason: "Signing unlocks only after the exact transaction matches and simulation passes." };
    return { ok: true };
  })();

  const sign = useCallback(async () => {
    const current = stateRef.current;
    const signer = wallet.signer;
    if (!signer || !online || devnet.state !== "verified" || !wallet.supportsDevnet || wallet.address !== current.approvedIntent?.sender || !canRequestSignature(current)) return;
    const intent = current.approvedIntent;
    const prepared = current.prepared;
    const verification = current.verification;
    const simulation = current.simulation;
    const context = current.networkContext;
    if (!intent || !prepared || !verification || !simulation || !context) return;
    const approvalId = intent.approvalId;

    // Synchronous double-click guard: one wallet request per approval, ever.
    if (!lockRef.current.acquire(approvalId)) return;

    const rpc = getRpcPort();
    const controller = new AbortController();
    signAbort.current = controller;
    const operation: SigningOperation = { approvalId, sender: intent.sender, signer, controller, broadcastAttempted: false };
    operationRef.current = operation;
    const isCurrent = () => {
      const runtime = runtimeRef.current;
      return operationRef.current === operation && !controller.signal.aborted &&
        stateRef.current.approvedIntent?.approvalId === approvalId && stateRef.current.status === "AWAITING_WALLET" &&
        runtime.address === intent.sender && runtime.signer === signer && runtime.supportsDevnet && runtime.online && runtime.networkVerified;
    };
    // Lock the form before the first await, including the lifetime check.
    dispatch({ type: "SIGN_REQUESTED", approvalId });
    try {
      // A blockhash that already expired must be rebuilt and re-approved first.
      try {
        const height = await rpc.getBlockHeight(controller.signal);
        if (height > prepared.lifetime.lastValidBlockHeight) {
          dispatch({ type: "LIFETIME_EXPIRED", approvalId });
          return;
        }
      } catch {
        if (!isCurrent()) return;
        throw new SignBoundaryError("GATE_CLOSED", "The recent blockhash could not be checked. Review and approve again when Devnet is available.");
      }

      if (!isCurrent()) return;
      const signed = await signVerifiedTransfer({ intent, prepared, verification, simulation, context, signer, signal: controller.signal });
      if (!isCurrent()) return;
      dispatch({ type: "SIGNED", approvalId, signed });

      // From this point a lost response is ambiguous. Account changes must not
      // erase the signature or cancel receipt tracking.
      operation.broadcastAttempted = true;
      rememberTransactionSignature(intent.sender, signed.signature);
      dispatch({ type: "BROADCAST_STARTED", approvalId, submittedAt: Date.now() });
      const outcome = await submitSignedTransfer(rpc, signed, prepared.lifetime.lastValidBlockHeight, { signal: controller.signal });
      dispatch({ type: "SUBMIT_RESOLVED", approvalId, outcome, submittedAt: Date.now() });
      if (outcome.kind !== "submitted" && outcome.kind !== "unknown") {
        forgetTransactionSignature(intent.sender, signed.signature);
        return;
      }

      await waitForConfirmation(
        rpc,
        { signature: signed.signature, lastValidBlockHeight: prepared.lifetime.lastValidBlockHeight },
        {
          signal: controller.signal,
          onUpdate: (interpretation) => dispatch({ type: "CONFIRMATION_UPDATED", approvalId, interpretation }),
        },
      );
      // A fresh transfer may start while optional receipt metadata is fetched.
      // The lock still remembers this approval as used, so it cannot be re-signed.
      lockRef.current.release(approvalId);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (operation.broadcastAttempted) {
        dispatch({ type: "CONFIRMATION_UPDATED", approvalId, interpretation: { status: "unknown", confirmationStatus: null, slot: null, error: "The send result is unresolved. Check the recorded signature before sending again." } });
        return;
      }
      if (error instanceof SignBoundaryError) {
        dispatch({ type: "SIGN_FAILED", approvalId, code: error.code, message: error.message });
      } else {
        dispatch({ type: "SIGN_FAILED", approvalId, code: "WALLET_ERROR", message: "Signing did not complete. Nothing was sent." });
      }
    } finally {
      lockRef.current.release(approvalId);
      if (operationRef.current === operation) operationRef.current = null;
    }
  }, [online, devnet.state, wallet.address, wallet.supportsDevnet, wallet.signer, dispatch]);

  const reviewAgain = useCallback(() => {
    setApprovalErrors(null);
    dispatch({ type: "REVIEW_AGAIN" });
  }, [dispatch]);

  const reset = useCallback(() => {
    parseAbort.current?.abort();
    pipelineAbort.current?.abort();
    cancelPreBroadcast();
    setApprovalErrors(null);
    dispatch({ type: "RESET" });
  }, [cancelPreBroadcast, dispatch]);

  return {
    state,
    wallet,
    online,
    devnet,
    approvalErrors,
    signAvailability,
    actions: { setComposerText, editDraft, enterManually, analyze, cancelAnalysis, approve, sign, reviewAgain, reset, recheckDevnet },
  };
}
