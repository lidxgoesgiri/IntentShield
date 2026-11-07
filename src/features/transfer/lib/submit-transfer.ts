import { classifyRpcError, type SolanaRpcPort } from "@/lib/solana/rpc";
import { describeTransactionError } from "@/lib/solana/transaction-errors";
import type { SignedTransfer } from "../types";

export type SubmitOutcome =
  | { kind: "submitted"; signature: string }
  /** The RPC explicitly refused it (e.g. preflight failure) — it was not broadcast. */
  | { kind: "rejected"; code: string; message: string }
  /** The blockhash lifetime ended before broadcast — it can never land. */
  | { kind: "expired"; message: string }
  /** Transport failure: the RPC may or may not have received it. Poll the known signature. */
  | { kind: "unknown"; signature: string; message: string };

/**
 * Broadcast the verified signed bytes exactly once. Never re-signs and never
 * builds a replacement transaction (PRD §6.5 resend prevention).
 */
export async function submitSignedTransfer(
  rpc: SolanaRpcPort,
  signed: SignedTransfer,
  lastValidBlockHeight: bigint,
  options: { signal?: AbortSignal } = {},
): Promise<SubmitOutcome> {
  try {
    const height = await rpc.getBlockHeight(options.signal);
    if (height > lastValidBlockHeight) {
      return {
        kind: "expired",
        message: "The signed transaction expired before it could be sent. Nothing was broadcast. Review and approve again.",
      };
    }
  } catch {
    // Height unknown: still attempt the single broadcast; preflight will reject
    // an expired blockhash explicitly.
  }

  try {
    options.signal?.throwIfAborted();
    const returned = await rpc.sendTransaction(signed.wireBase64, options.signal);
    if (returned !== signed.signature) {
      return {
        kind: "unknown",
        signature: signed.signature,
        message: "The RPC returned an unexpected signature. Tracking the signature that was signed instead.",
      };
    }
    return { kind: "submitted", signature: signed.signature };
  } catch (error) {
    const classified = classifyRpcError(error);
    if (classified.kind === "rpc" && classified.transactionError !== null && classified.transactionError !== undefined) {
      const described = describeTransactionError(classified.transactionError);
      if (classified.transactionError === "AlreadyProcessed") {
        return {
          kind: "unknown",
          signature: signed.signature,
          message: "The RPC reports that this transaction was already processed. Checking the original signature without resending.",
        };
      }
      if (described.code === "BLOCKHASH_NOT_FOUND") {
        return { kind: "expired", message: described.message };
      }
      return {
        kind: "rejected",
        code: classified.transactionError ? described.code : "RPC_REJECTED",
        message: classified.transactionError ? described.message : classified.message,
      };
    }
    return {
      kind: "unknown",
      signature: signed.signature,
      message: "Lost contact with the RPC while sending. The transaction may or may not have been received — checking its status.",
    };
  }
}
