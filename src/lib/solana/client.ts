import { publicConfig } from "@/config/env";
import { createSolanaRpcPort, type SolanaRpcPort } from "./rpc";

let port: SolanaRpcPort | null = null;

/** Browser-side Devnet RPC port (lazy singleton). */
export function getRpcPort(): SolanaRpcPort {
  port ??= createSolanaRpcPort(publicConfig.rpcUrl);
  return port;
}
