import { getBase64Encoder, getTransactionDecoder } from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@/config/product";
import type { ReceiptStatus } from "@/features/transfer/types";
import { decodeTransactionMessage, parseSystemTransferData } from "@/features/verification/lib/decode-transaction";
import { matchTransferShape } from "@/features/verification/lib/transfer-shape";
import { classifyRpcError, type SolanaRpcPort } from "@/lib/solana/rpc";
import { describeTransactionError } from "@/lib/solana/transaction-errors";

export type DecodedOnChainTransfer = Readonly<{ sender: string; recipient: string; amountLamports: bigint }>;

export type ReceiptLookup =
  | {
      kind: "found";
      status: Extract<ReceiptStatus, "confirmed" | "confirming" | "onchain_failed">;
      confirmationStatus: "processed" | "confirmed" | "finalized" | null;
      slot: bigint | null;
      blockTime: bigint | null;
      feeLamports: bigint | null;
      error: string | null;
      /** Present only for exactly one System Program transfer (optionally with the app's fixed compute budget). */
      transfer: DecodedOnChainTransfer | null;
    }
  | { kind: "not_found" }
  | { kind: "unavailable"; message: string };

/** Decode a single native SOL transfer from raw on-chain wire bytes (or null), using the verifier's layout rule. */
export function decodeOnChainTransfer(wireBase64: string): DecodedOnChainTransfer | null {
  try {
    const wire = getTransactionDecoder().decode(getBase64Encoder().encode(wireBase64));
    const decoded = decodeTransactionMessage(wire.messageBytes);
    if (!decoded.ok) return null;
    const shape = matchTransferShape(decoded.message.instructions);
    if (!shape.ok) return null;
    const ix = shape.transfer;
    if (!ix || ix.programId !== SYSTEM_PROGRAM_ADDRESS || ix.accounts.length !== 2) return null;
    const data = parseSystemTransferData(ix.data);
    const [source, destination] = ix.accounts;
    if (!data || !source || !destination) return null;
    return { sender: source.address, recipient: destination.address, amountLamports: data.lamports };
  } catch {
    return null;
  }
}

/**
 * Look a signature up on Devnet. "confirmed" is reported only when the RPC
 * returns the transaction at confirmed commitment (or a confirmed/finalized
 * status) with no error — never inferred.
 */
export async function loadReceipt(rpc: SolanaRpcPort, signature: string, signal?: AbortSignal): Promise<ReceiptLookup> {
  try {
    const [status, tx] = await Promise.all([
      rpc.getSignatureStatus(signature, { searchTransactionHistory: true }, signal),
      rpc.getTransaction(signature, signal),
    ]);
    if (!status && !tx) return { kind: "not_found" };

    const err = tx?.err ?? status?.err ?? null;
    const confirmationStatus = status?.confirmationStatus ?? (tx ? "confirmed" : null);
    const isConfirmed = confirmationStatus === "confirmed" || confirmationStatus === "finalized";

    return {
      kind: "found",
      status: err !== null && err !== undefined ? "onchain_failed" : isConfirmed ? "confirmed" : "confirming",
      confirmationStatus,
      slot: tx?.slot ?? status?.slot ?? null,
      blockTime: tx?.blockTime ?? null,
      feeLamports: tx?.fee ?? null,
      error: err !== null && err !== undefined ? describeTransactionError(err).message : null,
      transfer: tx ? decodeOnChainTransfer(tx.wireBase64) : null,
    };
  } catch (error) {
    const classified = classifyRpcError(error);
    if (classified.kind === "aborted") throw classified;
    return { kind: "unavailable", message: "Solana Devnet RPC could not be reached, so the status cannot be shown." };
  }
}
