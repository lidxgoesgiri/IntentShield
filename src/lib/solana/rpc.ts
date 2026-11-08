import {
  createSolanaRpc, isBlockhash, isSolanaError, SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE,
  SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR, SOLANA_ERROR__TRANSACTION_ERROR__ALREADY_PROCESSED,
  SOLANA_ERROR__TRANSACTION_ERROR__BLOCKHASH_NOT_FOUND, SOLANA_ERROR__TRANSACTION_ERROR__INSUFFICIENT_FUNDS_FOR_FEE,
  SOLANA_ERROR__TRANSACTION_ERROR__ACCOUNT_NOT_FOUND, SOLANA_ERROR__TRANSACTION_ERROR__INSUFFICIENT_FUNDS_FOR_RENT,
  SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM,
  type Address, type Base64EncodedWireTransaction, type Signature, type TransactionMessageBytesBase64,
} from "@solana/kit";
import { z } from "zod";

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
    // Kit converts raw data.err into an error cause (not context.err).
    const cause = error.cause;
    let transactionError: unknown = null;
    if (isSolanaError(cause, SOLANA_ERROR__TRANSACTION_ERROR__ALREADY_PROCESSED)) transactionError = "AlreadyProcessed";
    else if (isSolanaError(cause, SOLANA_ERROR__TRANSACTION_ERROR__BLOCKHASH_NOT_FOUND)) transactionError = "BlockhashNotFound";
    else if (isSolanaError(cause, SOLANA_ERROR__TRANSACTION_ERROR__INSUFFICIENT_FUNDS_FOR_FEE)) transactionError = "InsufficientFundsForFee";
    else if (isSolanaError(cause, SOLANA_ERROR__TRANSACTION_ERROR__ACCOUNT_NOT_FOUND)) transactionError = "AccountNotFound";
    else if (isSolanaError(cause, SOLANA_ERROR__TRANSACTION_ERROR__INSUFFICIENT_FUNDS_FOR_RENT)) {
      transactionError = { InsufficientFundsForRent: { account_index: cause.context.accountIndex } };
    } else if (isSolanaError(cause, SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM)) {
      transactionError = { InstructionError: [cause.context.index, { Custom: cause.context.code }] };
    } else if (isSolanaError(cause)) transactionError = { PreflightRejected: cause.context.__code };
    return new RpcRequestError("rpc", "The RPC rejected the transaction during preflight.", transactionError);
  }
  if (isSolanaError(error, SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR)) {
    return new RpcRequestError("transport", "The Solana RPC returned an HTTP error; receipt of the request is unknown.");
  }
  if (isSolanaError(error)) {
    // Kit codes are numeric. Unknown/internal RPC errors cannot establish that
    // a submitted transaction was never received by an upstream node.
    return new RpcRequestError("transport", "The Solana RPC request could not be verified.");
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

const unsignedInteger = z.union([z.bigint(), z.number().int().safe().transform(BigInt)])
  .refine((value) => value >= 0n && value <= 18_446_744_073_709_551_615n);
// Do not default an absent `err` to null: only an explicit null proves that
// the RPC reported success. Nonempty objects cover Solana transaction errors.
const transactionError = z.union([
  z.null(),
  z.string().min(1),
  z.record(z.string(), z.unknown()).refine((value) => Object.keys(value).length > 0),
]);
const simulationSchema = z.object({
  err: transactionError,
  logs: z.array(z.string()).nullable().optional().transform((value) => value ?? null),
  unitsConsumed: unsignedInteger.nullable().optional().transform((value) => value ?? null),
});
const signatureStatusSchema = z.object({
  confirmationStatus: z.enum(["processed", "confirmed", "finalized"]).nullable(),
  err: transactionError,
  slot: unsignedInteger,
});
const transactionSchema = z.object({
  slot: unsignedInteger,
  blockTime: unsignedInteger.nullable(),
  meta: z.object({ err: transactionError, fee: unsignedInteger }),
  transaction: z.tuple([z.string().min(4).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/), z.literal("base64")]),
});

function readRpcValue<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new RpcRequestError("transport", "The Solana RPC returned an unreadable response.");
  return parsed.data;
}

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
        return readRpcValue(z.object({ blockhash: z.string().refine(isBlockhash), lastValidBlockHeight: unsignedInteger }), value);
      }),

    getBlockHeight: (signal) =>
      call(signal, async (abortSignal) => readRpcValue(unsignedInteger, await rpc.getBlockHeight({ commitment: "confirmed" }).send({ abortSignal }))),

    getBalance: (address, signal) =>
      call(signal, async (abortSignal) => {
        const { value } = await rpc.getBalance(address as Address, { commitment: "confirmed" }).send({ abortSignal });
        return readRpcValue(unsignedInteger, value);
      }),

    getFeeForMessage: (messageBase64, signal) =>
      call(signal, async (abortSignal) => {
        const { value } = await rpc
          .getFeeForMessage(messageBase64 as TransactionMessageBytesBase64, { commitment: "confirmed" })
          .send({ abortSignal });
        return readRpcValue(unsignedInteger.nullable(), value);
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
        return readRpcValue(simulationSchema, value);
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
        const statuses = readRpcValue(z.tuple([signatureStatusSchema.nullable()]), value);
        return statuses[0];
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
        if (result === null) return null;
        const parsed = readRpcValue(transactionSchema, result);
        return {
          slot: parsed.slot,
          blockTime: parsed.blockTime,
          fee: parsed.meta.fee,
          err: parsed.meta.err,
          wireBase64: parsed.transaction[0],
        };
      }),
  };
}
