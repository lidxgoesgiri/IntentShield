import { DEVNET_GENESIS_HASH, SUPPORTED_CHAIN } from "@/config/product";
import type { VerificationContext } from "@/features/verification/types";
import type { SolanaRpcPort } from "./rpc";

export type NetworkCheck =
  | { ok: true; context: VerificationContext }
  | {
      ok: false;
      reason: "WRONG_CLUSTER" | "RPC_UNAVAILABLE";
      message: string;
      genesisHash: string | null;
      /** Sanitized transport detail for diagnostics (no user data). */
      cause?: string;
    };

/**
 * Devnet guard: ask the configured RPC which chain it serves and compare the
 * genesis hash against Devnet's. Any mismatch or failure is fail-closed.
 */
export async function checkDevnet(rpc: SolanaRpcPort, signal?: AbortSignal): Promise<NetworkCheck> {
  let genesisHash: string;
  try {
    genesisHash = await rpc.getGenesisHash(signal);
  } catch (error) {
    return {
      ok: false,
      reason: "RPC_UNAVAILABLE",
      message: "The Solana Devnet RPC could not be reached, so the network cannot be verified.",
      genesisHash: null,
      cause: error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 200) : "unknown",
    };
  }
  if (genesisHash !== DEVNET_GENESIS_HASH) {
    return {
      ok: false,
      reason: "WRONG_CLUSTER",
      message: "The configured RPC is not Solana Devnet. IntentShield refuses to build transactions on other networks.",
      genesisHash,
    };
  }
  return { ok: true, context: { cluster: SUPPORTED_CHAIN, genesisHash } };
}
