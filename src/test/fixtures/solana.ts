import { getTransferSolInstruction } from "@solana-program/system";
import {
  AccountRole,
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

export const COMPUTE_BUDGET_PROGRAM = "ComputeBudget111111111111111111111111111111" as Address;
export const LIGHTHOUSE_PROGRAM = "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95" as Address;

/** Compute Budget `SetComputeUnitLimit` (u8 2 + u32 LE), optionally with an (invalid) account. */
export function computeUnitLimitIx(units: number, account?: Address): Instruction {
  const data = new Uint8Array(5);
  data[0] = 2;
  new DataView(data.buffer).setUint32(1, units, true);
  return { programAddress: COMPUTE_BUDGET_PROGRAM, data, ...(account ? { accounts: [{ address: account, role: AccountRole.READONLY }] } : {}) };
}

/** Compute Budget `SetComputeUnitPrice` (u8 3 + u64 LE micro-lamports). */
export function computeUnitPriceIx(microLamports: bigint): Instruction {
  const data = new Uint8Array(9);
  data[0] = 3;
  new DataView(data.buffer).setBigUint64(1, microLamports, true);
  return { programAddress: COMPUTE_BUDGET_PROGRAM, data };
}

/** Stand-in for a wallet-added Lighthouse assertion (only the program id matters to the tests). */
export function lighthouseIx(): Instruction {
  return { programAddress: LIGHTHOUSE_PROGRAM, data: Uint8Array.from([0, 1, 2, 3]) };
}
