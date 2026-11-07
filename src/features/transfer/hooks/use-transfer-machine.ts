"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { approveIntent, type DraftFieldErrors } from "@/features/intent/lib/intent-validation";
import { requestIntentParse } from "@/features/intent/lib/parse-intent-client";
import { useConnectedWallet } from "@/features/wallet/hooks/use-connected-wallet";
import { useProductContext } from "@/features/wallet/product-context";
import { getRpcPort } from "@/lib/solana/client";
import { waitForConfirmation } from "../lib/confirm-transfer";
import { runPreSignPipeline } from "../lib/prepare-transfer";
import { SignBoundaryError, signVerifiedTransfer } from "../lib/sign-transfer";
import { createSigningLock } from "../lib/signing-lock";
import { submitSignedTransfer } from "../lib/submit-transfer";
import { canRequestSignature, createInitialState, transferReducer, type MachineState } from "../machine";

function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export type SignAvailability =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Orchestrates the real transfer workflow around the pure reducer:
 * AI parse → explicit approval → pre-sign pipeline → wallet sign boundary →
 * single broadcast → confirmation polling.
 */
export function useTransferMachine() {
  const wallet = useConnectedWallet();
  const { devnet, online } = useProductContext();
  const [state, dispatch] = useReducer(transferReducer, null, () => createInitialState(null));
  const [approvalErrors, setApprovalErrors] = useState<DraftFieldErrors | { sender: string } | null>(null);

  const stateRef = useRef<MachineState>(state);
  const lockRef = useRef(createSigningLock());
  const parseAbort = useRef<AbortController | null>(null);
  const pipelineAbort = useRef<AbortController | null>(null);
  const signAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Keep the machine bound to the connected wallet; any change invalidates approval.
  useEffect(() => {
    dispatch({ type: "WALLET_CHANGED", address: wallet.address });
    if (wallet.address === null) signAbort.current?.abort();
  }, [wallet.address]);

  // Abort everything in flight when the workspace unmounts.
  useEffect(
    () => () => {
      parseAbort.current?.abort();
      pipelineAbort.current?.abort();
      signAbort.current?.abort();
    },
    [],
  );

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
  }, [readyApprovalId, readyLastValid]);

  const setComposerText = useCallback((text: string) => dispatch({ type: "COMPOSER_CHANGED", text }), []);
  const editDraft = useCallback((field: "amountSol" | "recipient", value: string) => {
    setApprovalErrors(null);
    dispatch({ type: "DRAFT_EDITED", field, value });
  }, []);
  const enterManually = useCallback(() => dispatch({ type: "MANUAL_ENTRY" }), []);

  const analyze = useCallback(async () => {
    const text = stateRef.current.composerText;
    parseAbort.current?.abort();
    const controller = new AbortController();
    parseAbort.current = controller;
    const requestId = newRequestId();
    dispatch({ type: "PARSE_STARTED", requestId });
    try {
      const result = await requestIntentParse(text, { signal: controller.signal });
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
  }, []);

  const approve = useCallback(async () => {
    const current = stateRef.current;
    if (current.status !== "DRAFT_READY") return;
    if (devnet.state !== "verified") {
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
  }, [devnet.state, wallet.address, wallet.messageVersion]);

  const signAvailability: SignAvailability = (() => {
    if (!wallet.address) return { ok: false, reason: "Connect a Devnet wallet to continue." };
    if (!online) return { ok: false, reason: "You are offline. Signing is disabled until you reconnect." };
    if (!wallet.supportsDevnet) return { ok: false, reason: "This wallet account does not support Solana Devnet." };
    if (!wallet.signer) return { ok: false, reason: "This wallet cannot sign without broadcasting, so the signed bytes cannot be verified." };
    if (!canRequestSignature(state)) return { ok: false, reason: "Signing unlocks only after the exact transaction matches and simulation passes." };
    return { ok: true };
  })();

  const sign = useCallback(async () => {
    const current = stateRef.current;
    const signer = wallet.signer;
    if (!signer || !online || !canRequestSignature(current)) return;
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
    try {
      // A blockhash that already expired must be rebuilt and re-approved first.
      try {
        const height = await rpc.getBlockHeight(controller.signal);
        if (height > prepared.lifetime.lastValidBlockHeight) {
          dispatch({ type: "LIFETIME_EXPIRED", approvalId });
          return;
        }
      } catch {
        /* height unknown: the submit step re-checks before broadcasting */
      }

      dispatch({ type: "SIGN_REQUESTED", approvalId });
      const signed = await signVerifiedTransfer({ intent, prepared, verification, simulation, context, signer, signal: controller.signal });
      dispatch({ type: "SIGNED", approvalId, signed });

      const outcome = await submitSignedTransfer(rpc, signed, prepared.lifetime.lastValidBlockHeight, { signal: controller.signal });
      dispatch({ type: "SUBMIT_RESOLVED", approvalId, outcome, submittedAt: Date.now() });
      if (outcome.kind !== "submitted" && outcome.kind !== "unknown") return;

      const final = await waitForConfirmation(
        rpc,
        { signature: signed.signature, lastValidBlockHeight: prepared.lifetime.lastValidBlockHeight },
        {
          signal: controller.signal,
          onUpdate: (interpretation) => dispatch({ type: "CONFIRMATION_UPDATED", approvalId, interpretation }),
        },
      );
      if (final.status === "confirmed") {
        try {
          const details = await rpc.getTransaction(signed.signature, controller.signal);
          if (details) {
            dispatch({
              type: "CONFIRMATION_UPDATED",
              approvalId,
              interpretation: final,
              details: { blockTime: details.blockTime, feeLamports: details.fee },
            });
          }
        } catch {
          /* details are optional; status is already confirmed by RPC */
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof SignBoundaryError) {
        dispatch({ type: "SIGN_FAILED", approvalId, code: error.code, message: error.message });
      } else {
        dispatch({ type: "SIGN_FAILED", approvalId, code: "WALLET_ERROR", message: "Signing did not complete. Nothing was sent." });
      }
    } finally {
      lockRef.current.release(approvalId);
    }
  }, [online, wallet.signer]);

  const reviewAgain = useCallback(() => {
    setApprovalErrors(null);
    dispatch({ type: "REVIEW_AGAIN" });
  }, []);

  const reset = useCallback(() => {
    parseAbort.current?.abort();
    pipelineAbort.current?.abort();
    setApprovalErrors(null);
    dispatch({ type: "RESET" });
  }, []);

  return {
    state,
    wallet,
    online,
    devnet,
    approvalErrors,
    signAvailability,
    actions: { setComposerText, editDraft, enterManually, analyze, approve, sign, reviewAgain, reset },
  };
}
