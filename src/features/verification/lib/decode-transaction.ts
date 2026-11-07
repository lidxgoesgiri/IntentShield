import {
  getCompiledTransactionMessageDecoder,
  getCompiledTransactionMessageEncoder,
} from "@solana/kit";
import { bytesEqual } from "./fingerprint-message";

/** Solana's maximum serialized transaction size; a message can never be larger. */
export const MAX_MESSAGE_BYTES = 1232;

export type DecodedAccount = Readonly<{
  address: string;
  isSigner: boolean;
  isWritable: boolean;
}>;

export type DecodedInstruction = Readonly<{
  programIndex: number;
  programId: string | null;
  accountIndices: readonly number[];
  /** Resolved static accounts; `null` when an index points outside static keys. */
  accounts: readonly (DecodedAccount | null)[];
  data: Uint8Array;
}>;

export type DecodedMessage = Readonly<{
  version: "legacy" | 0;
  header: Readonly<{
    numSignerAccounts: number;
    numReadonlySignerAccounts: number;
    numReadonlyNonSignerAccounts: number;
  }>;
  accounts: readonly DecodedAccount[];
  lifetimeToken: string;
  instructions: readonly DecodedInstruction[];
  addressTableLookupCount: number;
}>;

export type DecodeErrorCode =
  | "EMPTY_OR_OVERSIZED"
  | "MALFORMED"
  | "TRAILING_BYTES"
  | "NON_CANONICAL"
  | "UNSUPPORTED_VERSION"
  | "INVALID_HEADER"
  | "INDEX_OUT_OF_RANGE";

export type DecodeOutcome =
  | { ok: true; message: DecodedMessage }
  | { ok: false; error: DecodeErrorCode; version?: string };

/**
 * Decode the exact wire-format message bytes that will be handed to the
 * wallet. Uses Kit's official codec, then requires (1) no trailing bytes and
 * (2) a byte-identical canonical re-encoding, so two parsers can never
 * disagree about what the bytes mean.
 */
export function decodeTransactionMessage(bytes: ArrayLike<number>): DecodeOutcome {
  const input = Uint8Array.from(bytes);
  if (input.length === 0 || input.length > MAX_MESSAGE_BYTES) {
    return { ok: false, error: "EMPTY_OR_OVERSIZED" };
  }

  let compiled: ReturnType<ReturnType<typeof getCompiledTransactionMessageDecoder>["decode"]>;
  let offset: number;
  try {
    [compiled, offset] = getCompiledTransactionMessageDecoder().read(input, 0);
  } catch {
    return { ok: false, error: "MALFORMED" };
  }
  if (offset !== input.length) return { ok: false, error: "TRAILING_BYTES" };

  try {
    const reencoded = getCompiledTransactionMessageEncoder().encode(compiled);
    if (!bytesEqual(reencoded, input)) return { ok: false, error: "NON_CANONICAL" };
  } catch {
    return { ok: false, error: "NON_CANONICAL" };
  }

  if (compiled.version !== "legacy" && compiled.version !== 0) {
    return { ok: false, error: "UNSUPPORTED_VERSION", version: String(compiled.version) };
  }

  const { header, staticAccounts } = compiled;
  const total = staticAccounts.length;
  if (
    header.numSignerAccounts < 1 ||
    header.numSignerAccounts > total ||
    header.numReadonlySignerAccounts >= header.numSignerAccounts ||
    header.numSignerAccounts + header.numReadonlyNonSignerAccounts > total
  ) {
    return { ok: false, error: "INVALID_HEADER" };
  }

  const accounts: DecodedAccount[] = staticAccounts.map((address, index) => {
    const isSigner = index < header.numSignerAccounts;
    const isWritable = isSigner
      ? index < header.numSignerAccounts - header.numReadonlySignerAccounts
      : index < total - header.numReadonlyNonSignerAccounts;
    return Object.freeze({ address: String(address), isSigner, isWritable });
  });

  const lookups = compiled.version === 0 ? (compiled.addressTableLookups ?? []) : [];
  const addressTableLookupCount = lookups.length;

  const instructions: DecodedInstruction[] = [];
  for (const instruction of compiled.instructions) {
    const programAccount = accounts[instruction.programAddressIndex];
    if (!programAccount) {
      return { ok: false, error: "INDEX_OUT_OF_RANGE" };
    }
    const accountIndices = [...(instruction.accountIndices ?? [])];
    const resolved = accountIndices.map((index) => accounts[index] ?? null);
    if (addressTableLookupCount === 0 && resolved.some((account) => account === null)) {
      return { ok: false, error: "INDEX_OUT_OF_RANGE" };
    }
    instructions.push(
      Object.freeze({
        programIndex: instruction.programAddressIndex,
        programId: programAccount.address,
        accountIndices,
        accounts: resolved,
        data: Uint8Array.from(instruction.data ?? []),
      }),
    );
  }

  return {
    ok: true,
    message: Object.freeze({
      version: compiled.version,
      header: Object.freeze({ ...header }),
      accounts,
      lifetimeToken: String(compiled.lifetimeToken),
      instructions,
      addressTableLookupCount,
    }),
  };
}

/** Parse System Program `Transfer` data: u32 LE discriminator (2) + u64 LE lamports. */
export function parseSystemTransferData(data: Uint8Array): { lamports: bigint } | null {
  if (data.length !== 12) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.getUint32(0, true) !== 2) return null;
  return { lamports: view.getBigUint64(4, true) };
}

export type ComputeBudgetData =
  | Readonly<{ kind: "unitLimit"; units: number }>
  | Readonly<{ kind: "unitPrice"; microLamports: bigint }>;

/**
 * Parse Compute Budget program data: `SetComputeUnitLimit` (u8 2 + u32 LE) or
 * `SetComputeUnitPrice` (u8 3 + u64 LE). Any other instruction or length → null.
 */
export function parseComputeBudgetData(data: Uint8Array): ComputeBudgetData | null {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length === 5 && data[0] === 2) return { kind: "unitLimit", units: view.getUint32(1, true) };
  if (data.length === 9 && data[0] === 3) return { kind: "unitPrice", microLamports: view.getBigUint64(1, true) };
  return null;
}
