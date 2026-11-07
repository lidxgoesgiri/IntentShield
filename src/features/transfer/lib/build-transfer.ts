import { getTransferSolInstruction } from "@solana-program/system";
import {
  appendTransactionMessageInstruction,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Blockhash,
} from "@solana/kit";
import { fingerprintMessage } from "@/features/verification/lib/fingerprint-message";

export type TransferMessageVersion = "legacy" | 0;

export type BlockhashLifetime = Readonly<{
  blockhash: string;
  lastValidBlockHeight: bigint;
}>;

export type TransferParams = Readonly<{
  sender: Address;
  recipient: Address;
  amountLamports: bigint;
}>;

/**
 * The single, final artifact that is inspected, simulated and signed.
 * There is exactly one builder: the bytes verified are the bytes signed.
 */
export type PreparedTransfer = Readonly<{
  transaction: ReturnType<typeof compileTransaction>;
  /** Copy of the compiled message bytes (the signing payload). */
  messageBytes: Uint8Array;
  fingerprint: string;
  lifetime: BlockhashLifetime;
  version: TransferMessageVersion;
  /** Unsigned wire transaction (zeroed signature) for simulation. */
  unsignedWireBase64: string;
  builtAt: number;
}>;

/**
 * Compile one System Program `Transfer` instruction into a final transaction
 * message. Deliberately adds nothing else (no compute-budget or memo
 * instructions), so the verifier's single-instruction allowlist holds.
 */
export function buildNativeSolTransfer(
  params: TransferParams,
  lifetime: BlockhashLifetime,
  options: { version?: TransferMessageVersion; now?: number } = {},
): PreparedTransfer {
  const version = options.version ?? 0;
  const source = createNoopSigner(params.sender);

  const message = pipe(
    createTransactionMessage({ version }),
    (m) => setTransactionMessageFeePayer(params.sender, m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: lifetime.blockhash as Blockhash, lastValidBlockHeight: lifetime.lastValidBlockHeight },
        m,
      ),
    (m) =>
      appendTransactionMessageInstruction(
        getTransferSolInstruction({ source, destination: params.recipient, amount: params.amountLamports }),
        m,
      ),
  );

  const transaction = compileTransaction(message);
  const messageBytes = Uint8Array.from(transaction.messageBytes);

  return Object.freeze({
    transaction,
    messageBytes,
    fingerprint: fingerprintMessage(messageBytes),
    lifetime: Object.freeze({ ...lifetime }),
    version,
    unsignedWireBase64: getBase64EncodedWireTransaction(transaction),
    builtAt: options.now ?? Date.now(),
  });
}
