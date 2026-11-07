import { getTransferSolInstruction } from "@solana-program/system";
import {
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  getAddressDecoder,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Blockhash,
  type Instruction,
} from "@solana/kit";
import { DEVNET_GENESIS_HASH, SUPPORTED_CHAIN } from "@/config/product";
import { sha256 } from "@/features/verification/lib/sha256";
import type { VerificationContext } from "@/features/verification/types";

/** Deterministic test address: base58(sha256(seed)). No known private key. */
export function testAddress(seed: string): Address {
  return getAddressDecoder().decode(sha256(new TextEncoder().encode(`intentshield:test:${seed}`)));
}

export const SENDER = testAddress("sender");
export const RECIPIENT = testAddress("recipient");
export const OTHER = testAddress("other");
export const TEST_BLOCKHASH = testAddress("blockhash") as unknown as Blockhash;

export const DEVNET_CONTEXT: VerificationContext = {
  cluster: SUPPORTED_CHAIN,
  genesisHash: DEVNET_GENESIS_HASH,
};

export const MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr" as Address;

export function transferIx(source: Address, destination: Address, amount: bigint): Instruction {
  return getTransferSolInstruction({ source: createNoopSigner(source), destination, amount });
}

export function memoIx(text: string): Instruction {
  return { programAddress: MEMO_PROGRAM, data: new TextEncoder().encode(text) };
}

/** Compile arbitrary instructions into message bytes (for tamper tests). */
export function compileMessage(
  instructions: Instruction[],
  options: { feePayer?: Address; version?: "legacy" | 0 } = {},
): Uint8Array {
  const message = pipe(
    createTransactionMessage({ version: options.version ?? 0 }),
    (m) => setTransactionMessageFeePayer(options.feePayer ?? SENDER, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: TEST_BLOCKHASH, lastValidBlockHeight: 100n }, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  return Uint8Array.from(compileTransaction(message).messageBytes);
}

export const intentFor = (amountLamports: bigint, recipient: Address = RECIPIENT) => ({
  sender: SENDER,
  recipient,
  amountLamports,
  cluster: SUPPORTED_CHAIN,
});
