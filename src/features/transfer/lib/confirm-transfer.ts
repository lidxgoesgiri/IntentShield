import type { SignatureStatusInfo, SolanaRpcPort } from "@/lib/solana/rpc";
import { describeTransactionError } from "@/lib/solana/transaction-errors";
import type { ReceiptStatus } from "../types";

export type StatusInterpretation = Readonly<{
  status: ReceiptStatus;
  confirmationStatus: SignatureStatusInfo["confirmationStatus"];
  slot: bigint | null;
  error: string | null;
}>;

/**
 * Pure mapping from RPC signature status to receipt status (PRD FR-009).
 * `confirmed` only when the chain reports confirmed/finalized with no error.
 */
export function interpretSignatureStatus(
  status: SignatureStatusInfo | null,
  blockHeight: bigint | null,
  lastValidBlockHeight: bigint,
): StatusInterpretation {
  if (status) {
    if (status.err !== null && status.err !== undefined) {
      return {
        status: "onchain_failed",
        confirmationStatus: status.confirmationStatus,
        slot: status.slot,
        error: describeTransactionError(status.err).message,
      };
    }
    if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") {
      return { status: "confirmed", confirmationStatus: status.confirmationStatus, slot: status.slot, error: null };
    }
    return { status: "confirming", confirmationStatus: status.confirmationStatus, slot: status.slot, error: null };
  }
  if (blockHeight !== null && blockHeight > lastValidBlockHeight) {
    return { status: "expired", confirmationStatus: null, slot: null, error: null };
  }
  return { status: "confirming", confirmationStatus: null, slot: null, error: null };
}

const TERMINAL: ReadonlySet<ReceiptStatus> = new Set(["confirmed", "onchain_failed", "expired"]);

export type ConfirmOptions = Readonly<{
  signal?: AbortSignal;
  pollIntervalMs?: number;
  timeoutMs?: number;
  onUpdate?: (interpretation: StatusInterpretation) => void;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
}>;

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Poll until the transaction is confirmed, failed on chain, provably expired,
 * or the timeout elapses (→ `unknown`, never a guessed success/failure).
 */
export async function waitForConfirmation(
  rpc: SolanaRpcPort,
  target: { signature: string; lastValidBlockHeight: bigint },
  options: ConfirmOptions = {},
): Promise<StatusInterpretation> {
  const pollIntervalMs = options.pollIntervalMs ?? 1500;
  const timeoutMs = options.timeoutMs ?? 90_000;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  const startedAt = now();
  let last: StatusInterpretation = { status: "confirming", confirmationStatus: null, slot: null, error: null };

  while (now() - startedAt < timeoutMs) {
    options.signal?.throwIfAborted();
    try {
      const status = await rpc.getSignatureStatus(target.signature, { searchTransactionHistory: false }, options.signal);
      options.signal?.throwIfAborted();
      let height: bigint | null = null;
      if (!status) {
        try {
          height = await rpc.getBlockHeight(options.signal);
        } catch {
          height = null;
        }
      }
      options.signal?.throwIfAborted();
      let interpretation = interpretSignatureStatus(status, height, target.lastValidBlockHeight);
      if (interpretation.status === "expired") {
        // Last look with full history before declaring the transaction expired.
        const historical = await rpc.getSignatureStatus(target.signature, { searchTransactionHistory: true }, options.signal);
        options.signal?.throwIfAborted();
        interpretation = interpretSignatureStatus(historical, height, target.lastValidBlockHeight);
      }
      last = interpretation;
      options.onUpdate?.(interpretation);
      if (TERMINAL.has(interpretation.status)) return interpretation;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      // Transient RPC failure: keep polling; the timeout bounds the wait.
    }
    await sleep(pollIntervalMs, options.signal);
  }

  options.signal?.throwIfAborted();
  const unknown: StatusInterpretation = {
    status: "unknown",
    confirmationStatus: last.confirmationStatus,
    slot: last.slot,
    error: "Confirmation was not observed in time. Check the explorer before trying again.",
  };
  options.onUpdate?.(unknown);
  return unknown;
}
