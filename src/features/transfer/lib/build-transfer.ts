import { getTransferSolInstruction } from "@solana-program/system";
import {
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Blockhash,
  type Instruction,
} from "@solana/kit";
import {
  COMPUTE_BUDGET_PROGRAM_ADDRESS,
  TRANSFER_COMPUTE_UNIT_LIMIT,
  TRANSFER_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS,
} from "@/config/product";
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
 * The app's fixed compute budget: SetComputeUnitLimit (u8 2 + u32 LE) and
 * SetComputeUnitPrice (u8 3 + u64 LE). Wallets such as Phantom add their own
 * priority-fee instructions to transactions without a compute budget, which
 * would change the reviewed bytes; declaring it here keeps them identical.
 */
export function transferComputeBudgetInstructions(): Instruction[] {
  const limit = new Uint8Array(5);
  limit[0] = 2;
  new DataView(limit.buffer).setUint32(1, TRANSFER_COMPUTE_UNIT_LIMIT, true);
  const price = new Uint8Array(9);
  price[0] = 3;
  new DataView(price.buffer).setBigUint64(1, TRANSFER_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS, true);
  const programAddress = COMPUTE_BUDGET_PROGRAM_ADDRESS as Address;
  return [
    { programAddress, data: limit },
    { programAddress, data: price },
  ];
}

/**
 * Compile the final transaction message: the fixed compute budget followed by
 * one System Program `Transfer`. Nothing else (no memo or other programs), and
 * the verifier accepts exactly this layout.
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
      appendTransactionMessageInstructions(
        [
          ...transferComputeBudgetInstructions(),
          getTransferSolInstruction({ source, destination: params.recipient, amount: params.amountLamports }),
        ],
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
