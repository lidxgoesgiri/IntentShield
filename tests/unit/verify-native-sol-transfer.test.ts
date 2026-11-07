import { parseTransferSolInstruction } from "@solana-program/system";
import { getCompiledTransactionMessageEncoder, getCompiledTransactionMessageDecoder, type Address } from "@solana/kit";
import { describe, expect, it } from "vitest";
import { DEVNET_GENESIS_HASH } from "@/config/product";
import { buildNativeSolTransfer } from "@/features/transfer/lib/build-transfer";
import { decodeTransactionMessage, parseSystemTransferData } from "@/features/verification/lib/decode-transaction";
import { fingerprintMessage } from "@/features/verification/lib/fingerprint-message";
import { verifyNativeSolTransfer } from "@/features/verification/lib/verify-native-sol-transfer";
import type { IntentForVerification } from "@/features/verification/types";
import {
  compileMessage,
  computeUnitLimitIx,
  computeUnitPriceIx,
  DEVNET_CONTEXT,
  intentFor,
  memoIx,
  OTHER,
  RECIPIENT,
  SENDER,
  TEST_BLOCKHASH,
  testAddress,
  transferIx,
} from "@/test/fixtures/solana";

const POINT_ONE = 100_000_000n;
const POINT_EIGHT = 800_000_000n;
const lifetime = { blockhash: TEST_BLOCKHASH as string, lastValidBlockHeight: 100n };

function verify(
  messageBytes: Uint8Array,
  intent: IntentForVerification = intentFor(POINT_ONE),
  extra: Partial<Parameters<typeof verifyNativeSolTransfer>[0]> = {},
) {
  return verifyNativeSolTransfer({ intent, messageBytes, context: DEVNET_CONTEXT, now: 1, ...extra });
}

describe("verifyNativeSolTransfer — happy path", () => {
  it("UT-07: exact native SOL transfer built by the app is `matched`", () => {
    const prepared = buildNativeSolTransfer({ sender: SENDER, recipient: RECIPIENT, amountLamports: POINT_ONE }, lifetime);
    const result = verify(prepared.messageBytes);
    expect(result).toMatchObject({ ok: true, status: "matched", reasons: [] });
    expect(result.messageFingerprint).toBe(prepared.fingerprint);
    expect(result.decoded).toEqual({
      programId: "11111111111111111111111111111111",
      sender: SENDER,
      recipient: RECIPIENT,
      feePayer: SENDER,
      amountLamports: POINT_ONE,
    });
    expect(result.comparisons.every((row) => row.state === "match")).toBe(true);
  });

  it("matches legacy-format messages too", () => {
    const prepared = buildNativeSolTransfer(
      { sender: SENDER, recipient: RECIPIENT, amountLamports: POINT_ONE },
      lifetime,
      { version: "legacy" },
    );
    expect(verify(prepared.messageBytes).status).toBe("matched");
  });

  it("agrees with the official @solana-program/system parser on the decoded transfer", () => {
    const bytes = compileMessage([transferIx(SENDER, RECIPIENT, POINT_ONE)]);
    const decoded = decodeTransactionMessage(bytes);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    const ix = decoded.message.instructions[0]!;
    const official = parseTransferSolInstruction({
      programAddress: ix.programId as Address,
      accounts: ix.accounts.map((a) => ({ address: a!.address as Address, role: 1 })),
      data: ix.data,
    });
    expect(official.data.amount).toBe(parseSystemTransferData(ix.data)?.lamports);
  });
});

describe("verifyNativeSolTransfer — blocks every mismatch (fail closed)", () => {
  it("UT-08: amount changed 0.1 → 0.8 SOL is blocked with AMOUNT_MISMATCH", () => {
    const result = verify(compileMessage([transferIx(SENDER, RECIPIENT, POINT_EIGHT)]));
    expect(result.ok).toBe(false);
    expect(result.status).toBe("blocked");
    expect(result.reasons).toEqual(["AMOUNT_MISMATCH"]);
    expect(result.comparisons.find((r) => r.field === "amount")).toMatchObject({
      expected: "100000000",
      actual: "800000000",
      state: "changed",
    });
  });

  it("UT-09: recipient changed A → B is blocked with RECIPIENT_MISMATCH", () => {
    const result = verify(compileMessage([transferIx(SENDER, OTHER, POINT_ONE)]));
    expect(result.status).toBe("blocked");
    expect(result.reasons).toEqual(["RECIPIENT_MISMATCH"]);
  });

  it("detects a single-lamport difference", () => {
    const result = verify(compileMessage([transferIx(SENDER, RECIPIENT, POINT_ONE + 1n)]));
    expect(result.reasons).toEqual(["AMOUNT_MISMATCH"]);
  });

  it("UT-10: an appended extra instruction is blocked", () => {
    const result = verify(
      compileMessage([transferIx(SENDER, RECIPIENT, POINT_ONE), transferIx(SENDER, OTHER, POINT_EIGHT)]),
    );
    expect(result.status).toBe("blocked");
    expect(result.reasons).toContain("UNEXPECTED_ADDITIONAL_INSTRUCTION");
  });

  it("UT-10b: a prepended memo instruction is blocked", () => {
    const result = verify(compileMessage([memoIx("hello"), transferIx(SENDER, RECIPIENT, POINT_ONE)]));
    expect(result.reasons).toContain("UNEXPECTED_ADDITIONAL_INSTRUCTION");
    expect(result.ok).toBe(false);
  });

  it("UT-11: an unsupported program is blocked with UNSUPPORTED_PROGRAM", () => {
    const result = verify(compileMessage([memoIx("not a transfer")]));
    expect(result.status).toBe("blocked");
    expect(result.reasons).toContain("UNSUPPORTED_PROGRAM");
  });

  it("blocks a non-transfer System Program instruction", () => {
    // System `Assign` (discriminator 1) with a 32-byte owner.
    const data = new Uint8Array(36);
    new DataView(data.buffer).setUint32(0, 1, true);
    const assign = {
      programAddress: "11111111111111111111111111111111" as Address,
      accounts: [{ address: SENDER, role: 3 }],
      data,
    };
    const result = verify(compileMessage([assign]));
    expect(result.reasons).toContain("UNSUPPORTED_INSTRUCTION");
  });

  it("UT-12: a different fee payer is blocked with FEE_PAYER_MISMATCH", () => {
    const result = verify(compileMessage([transferIx(SENDER, RECIPIENT, POINT_ONE)], { feePayer: OTHER }));
    expect(result.status).toBe("blocked");
    expect(result.reasons).toContain("FEE_PAYER_MISMATCH");
  });

  it("blocks when funds would leave a different source account", () => {
    const result = verify(compileMessage([transferIx(OTHER, RECIPIENT, POINT_ONE)], { feePayer: SENDER }));
    expect(result.reasons).toContain("SENDER_MISMATCH");
    expect(result.ok).toBe(false);
  });

  it("UT-13: bytes that differ from the reviewed fingerprint are blocked with MESSAGE_CHANGED", () => {
    const reviewed = compileMessage([transferIx(SENDER, RECIPIENT, POINT_ONE)]);
    const swapped = compileMessage([transferIx(SENDER, RECIPIENT, POINT_ONE)], { version: "legacy" });
    const result = verify(swapped, intentFor(POINT_ONE), { expectedFingerprint: fingerprintMessage(reviewed) });
    expect(result.status).toBe("blocked");
    expect(result.reasons).toEqual(["MESSAGE_CHANGED"]);
  });

  it("reads the real bytes: patching the lamports field in place is caught", () => {
    const bytes = compileMessage([transferIx(SENDER, RECIPIENT, POINT_ONE)]);
    // Data = [02 00 00 00] + u64 LE lamports at the very end of the message.
    const patched = Uint8Array.from(bytes);
    const view = new DataView(patched.buffer);
    view.setBigUint64(patched.length - 8, POINT_EIGHT, true);
    const result = verify(patched, intentFor(POINT_ONE), { expectedFingerprint: fingerprintMessage(bytes) });
    expect(result.reasons).toEqual(expect.arrayContaining(["MESSAGE_CHANGED", "AMOUNT_MISMATCH"]));
  });

  it("blocks any network other than verified Devnet (WRONG_CLUSTER)", () => {
    const bytes = compileMessage([transferIx(SENDER, RECIPIENT, POINT_ONE)]);
    const mainnetGenesis = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
    for (const context of [
      { cluster: "solana:mainnet", genesisHash: DEVNET_GENESIS_HASH },
      { cluster: "solana:devnet", genesisHash: mainnetGenesis },
      { cluster: "solana:devnet", genesisHash: null },
    ]) {
      const result = verifyNativeSolTransfer({ intent: intentFor(POINT_ONE), messageBytes: bytes, context });
      expect(result.reasons).toContain("WRONG_CLUSTER");
      expect(result.ok).toBe(false);
    }
    const mainnetIntent = { ...intentFor(POINT_ONE), cluster: "solana:mainnet" };
    expect(verify(bytes, mainnetIntent).reasons).toContain("WRONG_CLUSTER");
  });

  it("re-validates the approved intent itself (INVALID_INTENT)", () => {
    const bytes = compileMessage([transferIx(SENDER, RECIPIENT, POINT_ONE)]);
    expect(verify(bytes, intentFor(0n)).reasons).toContain("INVALID_INTENT");
    expect(verify(bytes, intentFor(2_000_000_000n)).reasons).toContain("INVALID_INTENT");
    expect(verify(bytes, { ...intentFor(POINT_ONE), recipient: SENDER }).reasons).toContain("INVALID_INTENT");
  });
});

describe("verifyNativeSolTransfer — undecodable input is unable_to_verify", () => {
  it.each([
    ["empty", new Uint8Array()],
    ["random bytes", Uint8Array.from({ length: 40 }, (_, i) => (i * 37) % 251)],
    ["oversized", new Uint8Array(2000)],
  ])("%s → DECODE_FAILED / unable_to_verify", (_label, bytes) => {
    const result = verify(bytes);
    expect(result.ok).toBe(false);
    expect(result.status).toBe("unable_to_verify");
    expect(result.reasons).toContain("DECODE_FAILED");
  });

  it("rejects truncated and trailing-byte variants of a valid message", () => {
    const bytes = compileMessage([transferIx(SENDER, RECIPIENT, POINT_ONE)]);
    expect(verify(bytes.slice(0, bytes.length - 3)).status).toBe("unable_to_verify");
    const trailing = new Uint8Array(bytes.length + 1);
    trailing.set(bytes);
    expect(verify(trailing).reasons).toContain("DECODE_FAILED");
  });

  it("blocks v0 messages that use address lookup tables", () => {
    const decoder = getCompiledTransactionMessageDecoder();
    const base = decoder.decode(compileMessage([transferIx(SENDER, RECIPIENT, POINT_ONE)]));
    if (base.version === 1) throw new Error("expected a v0 message");
    // Re-point the destination (account index 1) at a lookup-table account (index 3).
    const withLookup = {
      ...base,
      version: 0 as const,
      addressTableLookups: [
        { lookupTableAddress: testAddress("lookup-table"), writableIndexes: [0], readonlyIndexes: [] },
      ],
      instructions: base.instructions.map((ix) => ({ ...ix, accountIndices: [0, 3] })),
    };
    const bytes = Uint8Array.from(getCompiledTransactionMessageEncoder().encode(withLookup));
    const result = verify(bytes);
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain("UNSUPPORTED_MESSAGE_FORMAT");
  });
});

describe("verifier purity", () => {
  it("is deterministic and does not mutate its inputs", () => {
    const bytes = compileMessage([transferIx(SENDER, RECIPIENT, POINT_ONE)]);
    const copy = Uint8Array.from(bytes);
    const intent = intentFor(POINT_ONE);
    const a = verify(bytes, intent);
    const b = verify(bytes, intent);
    expect(a).toEqual(b);
    expect(bytes).toEqual(copy);
    expect(Object.isFrozen(a)).toBe(true);
  });
});

describe("verifyNativeSolTransfer — fixed compute budget (wallet compatibility)", () => {
  const transfer = () => transferIx(SENDER, RECIPIENT, POINT_ONE);
  const blockedAsExtra = (bytes: Uint8Array) => {
    const result = verify(bytes);
    expect(result.status).toBe("blocked");
    expect(result.reasons).toContain("UNEXPECTED_ADDITIONAL_INSTRUCTION");
    expect(result.comparisons.find((row) => row.field === "instructions")?.state).toBe("changed");
  };

  it("the app's builder emits [limit 1,000, price 1, transfer] and that exact layout is matched", () => {
    const prepared = buildNativeSolTransfer({ sender: SENDER, recipient: RECIPIENT, amountLamports: POINT_ONE }, lifetime);
    const decoded = decodeTransactionMessage(prepared.messageBytes);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.message.instructions.map((ix) => ix.programId)).toEqual([
      "ComputeBudget111111111111111111111111111111",
      "ComputeBudget111111111111111111111111111111",
      "11111111111111111111111111111111",
    ]);
    expect(Array.from(decoded.message.instructions[0]!.data)).toEqual([2, 0xe8, 0x03, 0, 0]);
    expect(Array.from(decoded.message.instructions[1]!.data)).toEqual([3, 1, 0, 0, 0, 0, 0, 0, 0]);
    const result = verify(prepared.messageBytes);
    expect(result).toMatchObject({ ok: true, status: "matched", reasons: [] });
    expect(result.comparisons.find((row) => row.field === "instructions")).toMatchObject({
      actual: "1 transfer + fixed compute budget",
      state: "match",
    });
  });

  it("the same layout compiled independently is matched (no builder-only shortcut)", () => {
    expect(verify(compileMessage([computeUnitLimitIx(1_000), computeUnitPriceIx(1n), transfer()])).status).toBe("matched");
  });

  it("blocks a wallet-style priority fee (different limit and price)", () => {
    blockedAsExtra(compileMessage([computeUnitLimitIx(200_000), computeUnitPriceIx(100_000n), transfer()]));
  });

  it("blocks a compute unit limit that differs by one", () => {
    blockedAsExtra(compileMessage([computeUnitLimitIx(1_001), computeUnitPriceIx(1n), transfer()]));
  });

  it("blocks a higher compute unit price (a fee the user did not approve)", () => {
    blockedAsExtra(compileMessage([computeUnitLimitIx(1_000), computeUnitPriceIx(2n), transfer()]));
  });

  it("blocks compute budget instructions placed after the transfer", () => {
    blockedAsExtra(compileMessage([transfer(), computeUnitLimitIx(1_000), computeUnitPriceIx(1n)]));
  });

  it("blocks a partial or duplicated compute budget", () => {
    blockedAsExtra(compileMessage([computeUnitLimitIx(1_000), transfer()]));
    blockedAsExtra(compileMessage([computeUnitPriceIx(1n), computeUnitLimitIx(1_000), transfer()]));
    blockedAsExtra(compileMessage([computeUnitLimitIx(1_000), computeUnitPriceIx(1n), computeUnitPriceIx(1n), transfer()]));
  });

  it("blocks a compute budget instruction that carries an account", () => {
    blockedAsExtra(compileMessage([computeUnitLimitIx(1_000, OTHER), computeUnitPriceIx(1n), transfer()]));
  });

  it("still checks the transfer itself behind a valid compute budget", () => {
    const result = verify(compileMessage([computeUnitLimitIx(1_000), computeUnitPriceIx(1n), transferIx(SENDER, OTHER, POINT_EIGHT)]));
    expect(result.status).toBe("blocked");
    expect(result.reasons).toEqual(expect.arrayContaining(["RECIPIENT_MISMATCH", "AMOUNT_MISMATCH"]));
    expect(result.reasons).not.toContain("UNEXPECTED_ADDITIONAL_INSTRUCTION");
  });

  it("blocks a valid compute budget followed by something other than a transfer", () => {
    const result = verify(compileMessage([computeUnitLimitIx(1_000), computeUnitPriceIx(1n), memoIx("x")]));
    expect(result.status).toBe("blocked");
    expect(result.reasons).toContain("UNSUPPORTED_PROGRAM");
  });
});
