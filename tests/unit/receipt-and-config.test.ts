import { generateKeyPairSigner, getBase64Decoder, getBase64EncodedWireTransaction, compileTransaction, createTransactionMessage, pipe, setTransactionMessageFeePayer, setTransactionMessageLifetimeUsingBlockhash, appendTransactionMessageInstruction, type Blockhash } from "@solana/kit";
import { describe, expect, it } from "vitest";
import { parsePublicEnv } from "@/config/env";
import { explorerAddressUrl, explorerTransactionUrl } from "@/features/receipt/lib/explorer-url";
import { decodeOnChainTransfer, loadReceipt } from "@/features/receipt/lib/load-receipt";
import { RpcRequestError } from "@/lib/solana/rpc";
import { describeTransactionError } from "@/lib/solana/transaction-errors";
import { createFakeRpc } from "@/test/mocks/fake-rpc";
import { memoIx, RECIPIENT, SENDER, TEST_BLOCKHASH, transferIx } from "@/test/fixtures/solana";

const SIG = "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW";

function wireOf(instruction: ReturnType<typeof transferIx>): string {
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(SENDER, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: TEST_BLOCKHASH as Blockhash, lastValidBlockHeight: 1n }, m),
    (m) => appendTransactionMessageInstruction(instruction, m),
  );
  return getBase64EncodedWireTransaction(compileTransaction(message));
}

describe("receipt lookup (PRD FR-009, §10.5)", () => {
  it("decodes a single native SOL transfer from on-chain wire bytes", () => {
    expect(decodeOnChainTransfer(wireOf(transferIx(SENDER, RECIPIENT, 42n)))).toEqual({
      sender: SENDER,
      recipient: RECIPIENT,
      amountLamports: 42n,
    });
    expect(decodeOnChainTransfer(wireOf(memoIx("x")))).toBeNull();
    expect(decodeOnChainTransfer("not base64!")).toBeNull();
  });

  it("reports confirmed only with RPC evidence and no error", async () => {
    const rpc = createFakeRpc({ statuses: [{ confirmationStatus: "finalized", err: null, slot: 10n }] });
    rpc.port.getTransaction = async () => ({ slot: 10n, blockTime: 1_700_000_000n, fee: 5000n, err: null, wireBase64: wireOf(transferIx(SENDER, RECIPIENT, 7n)) });
    const lookup = await loadReceipt(rpc.port, SIG);
    expect(lookup).toMatchObject({ kind: "found", status: "confirmed", feeLamports: 5000n, transfer: { amountLamports: 7n } });
  });

  it("maps meta.err to onchain_failed, processed-only to confirming, nothing to not_found", async () => {
    const failed = createFakeRpc({ statuses: [{ confirmationStatus: "confirmed", err: { InstructionError: [0, { Custom: 1 }] }, slot: 3n }] });
    expect(await loadReceipt(failed.port, SIG)).toMatchObject({ kind: "found", status: "onchain_failed" });

    const processed = createFakeRpc({ statuses: [{ confirmationStatus: "processed", err: null, slot: 3n }] });
    expect(await loadReceipt(processed.port, SIG)).toMatchObject({ kind: "found", status: "confirming" });

    const missing = createFakeRpc({ statuses: [null] });
    expect(await loadReceipt(missing.port, SIG)).toEqual({ kind: "not_found" });
  });

  it("RPC failure → unavailable (never a guessed status)", async () => {
    const rpc = createFakeRpc();
    rpc.port.getSignatureStatus = async () => {
      throw new RpcRequestError("transport", "down");
    };
    expect((await loadReceipt(rpc.port, SIG)).kind).toBe("unavailable");
  });

  it("builds Devnet-pinned explorer links and rejects malformed signatures", () => {
    expect(explorerTransactionUrl(SIG)).toBe(`https://explorer.solana.com/tx/${SIG}?cluster=devnet`);
    expect(explorerTransactionUrl("abc")).toBeNull();
    expect(explorerAddressUrl(RECIPIENT)).toContain("cluster=devnet");
  });

  it("describes common transaction errors in plain language", () => {
    expect(describeTransactionError("BlockhashNotFound").code).toBe("BLOCKHASH_NOT_FOUND");
    expect(describeTransactionError({ InsufficientFundsForRent: { account_index: 1 } }).code).toBe("INSUFFICIENT_FUNDS_FOR_RENT");
    expect(describeTransactionError({ InstructionError: [0, { Custom: 1 }] }).code).toBe("INSUFFICIENT_LAMPORTS");
    expect(describeTransactionError({ weird: 1n }).code).toBe("UNKNOWN_TRANSACTION_ERROR");
  });
});

describe("public env (Devnet only, no dead links)", () => {
  it("applies Devnet defaults", () => {
    const result = parsePublicEnv({});
    expect(result.ok && result.env.NEXT_PUBLIC_SOLANA_CLUSTER).toBe("devnet");
    expect(result.ok && result.env.NEXT_PUBLIC_REPOSITORY_URL).toBeUndefined();
  });

  it("rejects mainnet/testnet clusters and non-https RPC URLs (fail closed)", () => {
    expect(parsePublicEnv({ NEXT_PUBLIC_SOLANA_CLUSTER: "mainnet-beta" }).ok).toBe(false);
    expect(parsePublicEnv({ NEXT_PUBLIC_SOLANA_CLUSTER: "testnet" }).ok).toBe(false);
    expect(parsePublicEnv({ NEXT_PUBLIC_SOLANA_RPC_URL: "http://evil.example" }).ok).toBe(false);
  });

  it("accepts a proof signature only if it is a valid signature", async () => {
    const signer = await generateKeyPairSigner();
    void signer;
    expect(parsePublicEnv({ NEXT_PUBLIC_PROOF_SIGNATURE: SIG }).ok).toBe(true);
    expect(parsePublicEnv({ NEXT_PUBLIC_PROOF_SIGNATURE: "not-a-signature" }).ok).toBe(false);
    expect(getBase64Decoder).toBeTypeOf("function");
  });
});
