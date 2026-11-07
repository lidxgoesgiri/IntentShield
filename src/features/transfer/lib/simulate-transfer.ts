import { getBase64Decoder } from "@solana/kit";
import type { ApprovedIntent } from "@/features/intent/types";
import { formatLamportsAsSol } from "@/lib/format/sol";
import { classifyRpcError, type SolanaRpcPort } from "@/lib/solana/rpc";
import { describeTransactionError } from "@/lib/solana/transaction-errors";
import type { SimulationResult } from "../types";
import type { PreparedTransfer } from "./build-transfer";

function unavailable(
  prepared: PreparedTransfer,
  now: number,
  kind: "timeout" | "unavailable",
  message: string,
): SimulationResult {
  return Object.freeze({
    ok: false,
    status: kind,
    error: message,
    errorCode: kind === "timeout" ? "RPC_TIMEOUT" : "RPC_UNAVAILABLE",
    logs: [],
    simulatedFingerprint: prepared.fingerprint,
    checkedAt: now,
  });
}

/**
 * Preflight (balance + exact fee) and RPC simulation of the exact unsigned
 * message (PRD FR-003, FR-006). Every unreadable/failed/unavailable outcome is
 * returned with `ok: false` — callers must keep signing disabled.
 */
export async function preflightAndSimulate(
  rpc: SolanaRpcPort,
  intent: ApprovedIntent,
  prepared: PreparedTransfer,
  options: { signal?: AbortSignal; now?: () => number } = {},
): Promise<SimulationResult> {
  const now = options.now ?? Date.now;
  const messageBase64 = getBase64Decoder().decode(prepared.messageBytes);

  let balance: bigint;
  let fee: bigint | null;
  try {
    [balance, fee] = await Promise.all([
      rpc.getBalance(intent.sender, options.signal),
      rpc.getFeeForMessage(messageBase64, options.signal),
    ]);
  } catch (error) {
    const classified = classifyRpcError(error);
    if (classified.kind === "aborted") throw classified;
    return unavailable(
      prepared,
      now(),
      classified.kind === "timeout" ? "timeout" : "unavailable",
      "Could not read balance and fee from Solana Devnet, so the transfer cannot be verified.",
    );
  }

  if (fee === null) {
    return Object.freeze({
      ok: false,
      status: "failed",
      error: "The network does not recognise this transaction's blockhash (it may have expired). Review and approve again.",
      errorCode: "BLOCKHASH_NOT_FOUND",
      logs: [],
      balanceLamports: balance,
      simulatedFingerprint: prepared.fingerprint,
      checkedAt: now(),
    });
  }

  const required = intent.amountLamports + fee;
  if (balance < required) {
    return Object.freeze({
      ok: false,
      status: "failed",
      error: `Insufficient balance: this transfer needs ${formatLamportsAsSol(required)} SOL (amount + ${formatLamportsAsSol(fee)} SOL fee) but the wallet holds ${formatLamportsAsSol(balance)} SOL on Devnet.`,
      errorCode: "INSUFFICIENT_BALANCE",
      logs: [],
      feeLamports: fee,
      balanceLamports: balance,
      simulatedFingerprint: prepared.fingerprint,
      checkedAt: now(),
    });
  }

  try {
    const value = await rpc.simulateTransaction(prepared.unsignedWireBase64, options.signal);
    if (!value || !Object.hasOwn(value, "err") || value.err === undefined) {
      return unavailable(prepared, now(), "unavailable", "The simulation response did not include an explicit outcome. Signing stays disabled.");
    }
    if (value.err !== null) {
      const described = describeTransactionError(value.err);
      return Object.freeze({
        ok: false,
        status: "failed",
        error: described.message,
        errorCode: described.code,
        logs: value.logs ?? [],
        feeLamports: fee,
        balanceLamports: balance,
        ...(value.unitsConsumed === null ? {} : { unitsConsumed: value.unitsConsumed }),
        simulatedFingerprint: prepared.fingerprint,
        checkedAt: now(),
      });
    }
    return Object.freeze({
      ok: true,
      status: "passed",
      error: null,
      errorCode: null,
      logs: value.logs ?? [],
      feeLamports: fee,
      balanceLamports: balance,
      ...(value.unitsConsumed === null ? {} : { unitsConsumed: value.unitsConsumed }),
      simulatedFingerprint: prepared.fingerprint,
      checkedAt: now(),
    });
  } catch (error) {
    const classified = classifyRpcError(error);
    if (classified.kind === "aborted") throw classified;
    return unavailable(
      prepared,
      now(),
      classified.kind === "timeout" ? "timeout" : "unavailable",
      "Simulation could not be completed by the Solana RPC. Signing stays disabled.",
    );
  }
}
