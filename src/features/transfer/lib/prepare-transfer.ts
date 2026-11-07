import type { ApprovedIntent } from "@/features/intent/types";
import { verifyNativeSolTransfer } from "@/features/verification/lib/verify-native-sol-transfer";
import type { VerificationContext, VerificationResult } from "@/features/verification/types";
import { checkDevnet } from "@/lib/solana/network";
import { classifyRpcError, type SolanaRpcPort } from "@/lib/solana/rpc";
import type { SimulationResult } from "../types";
import { buildNativeSolTransfer, type PreparedTransfer, type TransferMessageVersion } from "./build-transfer";
import { preflightAndSimulate } from "./simulate-transfer";

export type PipelineEvent =
  | { type: "build_started" }
  | { type: "build_succeeded"; prepared: PreparedTransfer; context: VerificationContext }
  | { type: "verification_completed"; result: VerificationResult }
  | { type: "simulation_started" }
  | { type: "simulation_completed"; result: SimulationResult };

export type PipelineOutcome =
  | {
      kind: "ready";
      prepared: PreparedTransfer;
      context: VerificationContext;
      verification: VerificationResult;
      simulation: SimulationResult;
    }
  | { kind: "blocked"; prepared: PreparedTransfer; context: VerificationContext; verification: VerificationResult }
  | { kind: "unable_to_verify"; code: string; message: string; verification?: VerificationResult; simulation?: SimulationResult }
  | { kind: "simulation_failed"; verification: VerificationResult; simulation: SimulationResult }
  | { kind: "aborted" };

/**
 * The pre-signature pipeline (PRD §13.3):
 *   Devnet guard → fetch blockhash → compile FINAL message → decode + verify
 *   the exact bytes → preflight balance/fee → simulate the exact bytes.
 * Every gate must pass for an outcome of `ready`; anything else fails closed.
 */
export async function runPreSignPipeline(
  rpc: SolanaRpcPort,
  intent: ApprovedIntent,
  options: {
    signal?: AbortSignal;
    version?: TransferMessageVersion;
    now?: () => number;
    onEvent?: (event: PipelineEvent) => void;
  } = {},
): Promise<PipelineOutcome> {
  const emit = options.onEvent ?? (() => undefined);
  const now = options.now ?? Date.now;
  const aborted = () => options.signal?.aborted === true;

  emit({ type: "build_started" });

  const network = await checkDevnet(rpc, options.signal);
  if (aborted()) return { kind: "aborted" };
  if (!network.ok) {
    return { kind: "unable_to_verify", code: network.reason, message: network.message };
  }

  let lifetime: { blockhash: string; lastValidBlockHeight: bigint };
  try {
    lifetime = await rpc.getLatestBlockhash(options.signal);
  } catch (error) {
    const classified = classifyRpcError(error);
    if (classified.kind === "aborted") return { kind: "aborted" };
    return {
      kind: "unable_to_verify",
      code: classified.kind === "timeout" ? "RPC_TIMEOUT" : "RPC_UNAVAILABLE",
      message: "Could not fetch a recent blockhash from Solana Devnet. Nothing was built or signed.",
    };
  }
  if (aborted()) return { kind: "aborted" };

  const prepared = buildNativeSolTransfer(
    { sender: intent.sender, recipient: intent.recipient, amountLamports: intent.amountLamports },
    lifetime,
    { version: options.version ?? 0, now: now() },
  );
  emit({ type: "build_succeeded", prepared, context: network.context });

  // Independent check of the exact bytes that would be signed.
  const verification = verifyNativeSolTransfer({
    intent,
    messageBytes: prepared.messageBytes,
    context: network.context,
    expectedFingerprint: prepared.fingerprint,
    now: now(),
  });
  emit({ type: "verification_completed", result: verification });

  if (verification.status === "unable_to_verify") {
    return {
      kind: "unable_to_verify",
      code: "VERIFICATION_INCONCLUSIVE",
      message: "The prepared transaction could not be verified. Signing is disabled.",
      verification,
    };
  }
  if (!verification.ok) {
    return { kind: "blocked", prepared, context: network.context, verification };
  }

  emit({ type: "simulation_started" });
  let simulation: SimulationResult;
  try {
    simulation = await preflightAndSimulate(rpc, intent, prepared, {
      ...(options.signal ? { signal: options.signal } : {}),
      now,
    });
  } catch {
    return { kind: "aborted" };
  }
  if (aborted()) return { kind: "aborted" };
  emit({ type: "simulation_completed", result: simulation });

  if (simulation.status === "unavailable" || simulation.status === "timeout") {
    return {
      kind: "unable_to_verify",
      code: simulation.errorCode ?? "RPC_UNAVAILABLE",
      message: simulation.error ?? "Simulation unavailable.",
      verification,
      simulation,
    };
  }
  if (!simulation.ok) return { kind: "simulation_failed", verification, simulation };

  return { kind: "ready", prepared, context: network.context, verification, simulation };
}
