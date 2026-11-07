import { createSolanaRpc, isSolanaError, SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE, type Address, type Base64EncodedWireTransaction, type Signature, type TransactionMessageBytesBase64 } from "@solana/kit";

/**
 * Narrow RPC port used by the transfer workflow. Keeping the surface small
 * makes every network dependency explicit and lets tests inject fakes.
 */
export type SignatureStatusInfo = Readonly<{
  confirmationStatus: "processed" | "confirmed" | "finalized" | null;
  err: unknown;
  slot: bigint;
}>;

export type SimulationRpcValue = Readonly<{
  err: unknown;
  logs: readonly string[] | null;
  unitsConsumed: bigint | null;
}>;

export type FetchedTransaction = Readonly<{
  slot: bigint;
  blockTime: bigint | null;
  fee: bigint | null;
  err: unknown;
  /** Raw wire transaction bytes as stored on chain. */
  wireBase64: string;
}>;

export interface SolanaRpcPort {
  getGenesisHash(signal?: AbortSignal): Promise<string>;
  getLatestBlockhash(signal?: AbortSignal): Promise<{ blockhash: string; lastValidBlockHeight: bigint }>;
  getBlockHeight(signal?: AbortSignal): Promise<bigint>;
  getBalance(address: string, signal?: AbortSignal): Promise<bigint>;
  getFeeForMessage(messageBase64: string, signal?: AbortSignal): Promise<bigint | null>;
  simulateTransaction(wireBase64: string, signal?: AbortSignal): Promise<SimulationRpcValue>;
  sendTransaction(wireBase64: string, signal?: AbortSignal): Promise<string>;
  getSignatureStatus(
    signature: string,
    options: { searchTransactionHistory: boolean },
    signal?: AbortSignal,
  ): Promise<SignatureStatusInfo | null>;
  getTransaction(signature: string, signal?: AbortSignal): Promise<FetchedTransaction | null>;
}

/** Error thrown when the RPC itself rejected a request (as opposed to transport failures). */
export class RpcRequestError extends Error {
  readonly kind: "rpc" | "transport" | "timeout" | "aborted";
  readonly transactionError: unknown;
  constructor(kind: RpcRequestError["kind"], message: string, transactionError: unknown = null) {
    super(message);
    this.name = "RpcRequestError";
    this.kind = kind;
    this.transactionError = transactionError;
  }
}

export function classifyRpcError(error: unknown): RpcRequestError {
  if (error instanceof RpcRequestError) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return new RpcRequestError("aborted", "Request was cancelled.");
  }
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return new RpcRequestError("timeout", "The Solana RPC did not respond in time.");
  }
  if (isSolanaError(error, SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE)) {
    const context = error.context as unknown as { err?: unknown };
    return new RpcRequestError("rpc", "The RPC rejected the transaction during preflight.", context.err ?? null);
  }
  if (isSolanaError(error)) {
    const code = String(error.context.__code);
    if (code.includes("TRANSPORT")) return new RpcRequestError("transport", "Could not reach the Solana RPC.");
    return new RpcRequestError("rpc", error.message);
  }
  if (error instanceof TypeError) {
    // fetch() network failures surface as TypeError in browsers.
    return new RpcRequestError("transport", "Could not reach the Solana RPC.");
  }
  return new RpcRequestError("transport", error instanceof Error ? error.message : "Unknown RPC failure.");
}

/** Combine a caller signal with a per-request timeout. */
export function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

const DEFAULT_TIMEOUT_MS = 12_000;

export function createSolanaRpcPort(rpcUrl: string, timeoutMs = DEFAULT_TIMEOUT_MS): SolanaRpcPort {
  const rpc = createSolanaRpc(rpcUrl);

  async function call<T>(signal: AbortSignal | undefined, run: (abortSignal: AbortSignal) => Promise<T>): Promise<T> {
    try {
      return await run(withTimeout(signal, timeoutMs));
    } catch (error) {
      throw classifyRpcError(error);
    }
  }

  return {
    getGenesisHash: (signal) => call(signal, async (abortSignal) => String(await rpc.getGenesisHash().send({ abortSignal }))),

    getLatestBlockhash: (signal) =>
      call(signal, async (abortSignal) => {
        const { value } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send({ abortSignal });
        return { blockhash: String(value.blockhash), lastValidBlockHeight: BigInt(value.lastValidBlockHeight) };
      }),

    getBlockHeight: (signal) =>
      call(signal, async (abortSignal) => BigInt(await rpc.getBlockHeight({ commitment: "confirmed" }).send({ abortSignal }))),

    getBalance: (address, signal) =>
      call(signal, async (abortSignal) => {
        const { value } = await rpc.getBalance(address as Address, { commitment: "confirmed" }).send({ abortSignal });
        return BigInt(value);
      }),

    getFeeForMessage: (messageBase64, signal) =>
      call(signal, async (abortSignal) => {
        const { value } = await rpc
          .getFeeForMessage(messageBase64 as TransactionMessageBytesBase64, { commitment: "confirmed" })
          .send({ abortSignal });
        return value === null ? null : BigInt(value);
      }),

    simulateTransaction: (wireBase64, signal) =>
      call(signal, async (abortSignal) => {
        const { value } = await rpc
          .simulateTransaction(wireBase64 as Base64EncodedWireTransaction, {
            encoding: "base64",
            sigVerify: false,
            replaceRecentBlockhash: false,
            commitment: "confirmed",
          })
          .send({ abortSignal });
        if (!value || typeof value !== "object") {
          throw new RpcRequestError("rpc", "Unreadable simulation response.");
        }
        return {
          err: value.err ?? null,
          logs: value.logs ?? null,
          unitsConsumed: value.unitsConsumed === undefined ? null : BigInt(value.unitsConsumed),
        };
      }),

    sendTransaction: (wireBase64, signal) =>
      call(signal, async (abortSignal) =>
        String(
          await rpc
            .sendTransaction(wireBase64 as Base64EncodedWireTransaction, {
              encoding: "base64",
              skipPreflight: false,
              preflightCommitment: "confirmed",
              // The app never re-signs; let the RPC node handle rebroadcast.
              maxRetries: 5n,
            })
            .send({ abortSignal }),
        ),
      ),

    getSignatureStatus: (signature, options, signal) =>
      call(signal, async (abortSignal) => {
        const { value } = await rpc
          .getSignatureStatuses([signature as Signature], { searchTransactionHistory: options.searchTransactionHistory })
          .send({ abortSignal });
        const status = value[0];
        if (!status) return null;
        return {
          confirmationStatus: status.confirmationStatus ?? null,
          err: status.err ?? null,
          slot: BigInt(status.slot),
        };
      }),

    getTransaction: (signature, signal) =>
      call(signal, async (abortSignal) => {
        const result = await rpc
          .getTransaction(signature as Signature, {
            encoding: "base64",
            maxSupportedTransactionVersion: 0,
            commitment: "confirmed",
          })
          .send({ abortSignal });
        if (!result) return null;
        return {
          slot: BigInt(result.slot),
          blockTime: result.blockTime === null ? null : BigInt(result.blockTime),
          fee: result.meta ? BigInt(result.meta.fee) : null,
          err: result.meta?.err ?? null,
          wireBase64: String(result.transaction[0]),
        };
      }),
  };
}
