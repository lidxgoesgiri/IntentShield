import {
  appendTransactionMessageInstruction,
  compileTransaction,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase64Encoder,
  getTransactionDecoder,
  partiallySignTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Blockhash,
  type KeyPairSigner,
  type Transaction,
} from "@solana/kit";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { approveIntent } from "@/features/intent/lib/intent-validation";
import type { ApprovedIntent } from "@/features/intent/types";
import { waitForConfirmation } from "@/features/transfer/lib/confirm-transfer";
import { runPreSignPipeline, type PipelineEvent } from "@/features/transfer/lib/prepare-transfer";
import { SignBoundaryError, signVerifiedTransfer, type TransactionSignerPort } from "@/features/transfer/lib/sign-transfer";
import { createSigningLock } from "@/features/transfer/lib/signing-lock";
import { submitSignedTransfer } from "@/features/transfer/lib/submit-transfer";
import { decodeTransactionMessage } from "@/features/verification/lib/decode-transaction";
import { RpcRequestError } from "@/lib/solana/rpc";
import { createFakeRpc } from "@/test/mocks/fake-rpc";
import { decodeTransactionMessage as decodeForTest } from "@/features/verification/lib/decode-transaction";
import { computeUnitLimitIx, computeUnitPriceIx, lighthouseIx, memoIx, RECIPIENT, TEST_BLOCKHASH, transferIx } from "@/test/fixtures/solana";

let wallet: KeyPairSigner;
let intent: ApprovedIntent;

beforeAll(async () => {
  wallet = await generateKeyPairSigner();
  const approval = approveIntent({ amountSol: "0.1", recipient: RECIPIENT }, wallet.address);
  if (!approval.ok) throw new Error("approval failed");
  intent = approval.intent;
});

/** Honest wallet: signs exactly what it is given. */
const honestSigner = (): TransactionSignerPort => ({
  modifyAndSignTransactions: vi.fn(async (txs: readonly Transaction[]) =>
    Promise.all(txs.map((tx) => partiallySignTransaction([wallet.keyPair], tx))),
  ),
});

async function readyOutcome(rpc = createFakeRpc().port) {
  const outcome = await runPreSignPipeline(rpc, intent);
  if (outcome.kind !== "ready") throw new Error(`expected ready, got ${outcome.kind}`);
  return outcome;
}

describe("pre-sign pipeline with a fake RPC (integration)", () => {
  it("builds → verifies → preflights → simulates the same bytes, then is ready", async () => {
    const { port, calls } = createFakeRpc();
    const events: PipelineEvent["type"][] = [];
    const outcome = await runPreSignPipeline(port, intent, { onEvent: (e) => events.push(e.type) });
    expect(outcome.kind).toBe("ready");
    expect(events).toEqual(["build_started", "build_succeeded", "verification_completed", "simulation_started", "simulation_completed"]);
    if (outcome.kind !== "ready") return;
    expect(outcome.verification.messageFingerprint).toBe(outcome.prepared.fingerprint);
    expect(outcome.simulation.simulatedFingerprint).toBe(outcome.prepared.fingerprint);
    expect(calls.getGenesisHash).toBe(1);
    expect(calls.simulateTransaction).toBe(1);
    expect(calls.sendTransaction).toBeUndefined();
  });

  it("FR-006: RPC unavailable → unable_to_verify, nothing simulated or sent", async () => {
    const { port, calls } = createFakeRpc({ genesisHash: new RpcRequestError("transport", "down") });
    const outcome = await runPreSignPipeline(port, intent);
    expect(outcome).toMatchObject({ kind: "unable_to_verify", code: "RPC_UNAVAILABLE" });
    expect(calls.simulateTransaction).toBeUndefined();
  });

  it("refuses a non-Devnet RPC (genesis hash mismatch)", async () => {
    const { port, calls } = createFakeRpc({ genesisHash: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d" });
    const outcome = await runPreSignPipeline(port, intent);
    expect(outcome).toMatchObject({ kind: "unable_to_verify", code: "WRONG_CLUSTER" });
    expect(calls.getLatestBlockhash).toBeUndefined();
  });

  it("blockhash fetch failure → unable_to_verify", async () => {
    const { port } = createFakeRpc({ blockhash: new RpcRequestError("timeout", "slow") });
    expect((await runPreSignPipeline(port, intent)).kind).toBe("unable_to_verify");
  });

  it("simulation error → simulation_failed with a readable reason", async () => {
    const { port } = createFakeRpc({
      simulation: { err: { InsufficientFundsForRent: { account_index: 1 } }, logs: [], unitsConsumed: 0n },
    });
    const outcome = await runPreSignPipeline(port, intent);
    expect(outcome.kind).toBe("simulation_failed");
    if (outcome.kind === "simulation_failed") {
      expect(outcome.simulation.errorCode).toBe("INSUFFICIENT_FUNDS_FOR_RENT");
      expect(outcome.simulation.ok).toBe(false);
    }
  });

  it("insufficient balance is caught before simulation (FR-003)", async () => {
    const { port, calls } = createFakeRpc({ balance: 100_000_000n });
    const outcome = await runPreSignPipeline(port, intent);
    expect(outcome.kind).toBe("simulation_failed");
    if (outcome.kind === "simulation_failed") expect(outcome.simulation.errorCode).toBe("INSUFFICIENT_BALANCE");
    expect(calls.simulateTransaction).toBeUndefined();
  });

  it("unknown blockhash (fee null) fails closed", async () => {
    const { port } = createFakeRpc({ fee: null });
    const outcome = await runPreSignPipeline(port, intent);
    expect(outcome.kind).toBe("simulation_failed");
  });

  it("simulation transport failure / timeout → unable_to_verify", async () => {
    const down = createFakeRpc({ simulation: new RpcRequestError("transport", "down") });
    expect((await runPreSignPipeline(down.port, intent)).kind).toBe("unable_to_verify");
    const slow = createFakeRpc({ simulation: new RpcRequestError("timeout", "slow") });
    expect(await runPreSignPipeline(slow.port, intent)).toMatchObject({ kind: "unable_to_verify", code: "RPC_TIMEOUT" });
  });

  it("aborting mid-pipeline reports aborted, never ready", async () => {
    const controller = new AbortController();
    const { port } = createFakeRpc();
    const original = port.getLatestBlockhash;
    port.getLatestBlockhash = async (signal) => {
      controller.abort();
      return original(signal);
    };
    expect((await runPreSignPipeline(port, intent, { signal: controller.signal })).kind).toBe("aborted");
  });
});

describe("sign boundary (integration)", () => {
  it("honest wallet: bytes unchanged + valid signature → signed wire rebuilt from reviewed bytes", async () => {
    const outcome = await readyOutcome();
    const signer = honestSigner();
    const signed = await signVerifiedTransfer({ intent, ...outcome, signer });
    const wire = getTransactionDecoder().decode(getBase64Encoder().encode(signed.wireBase64));
    expect(Uint8Array.from(wire.messageBytes)).toEqual(outcome.prepared.messageBytes);
    expect(signed.signedMessageFingerprint).toBe(outcome.prepared.fingerprint);
    expect(signer.modifyAndSignTransactions).toHaveBeenCalledTimes(1);
  });

  it("the app's message already carries its fixed compute budget, so a Phantom-style wallet has nothing to add", async () => {
    const outcome = await readyOutcome();
    const decoded = decodeForTest(outcome.prepared.messageBytes);
    expect(decoded.ok && decoded.message.instructions.map((ix) => ix.programId)).toEqual([
      "ComputeBudget111111111111111111111111111111",
      "ComputeBudget111111111111111111111111111111",
      "11111111111111111111111111111111",
    ]);
    const signed = await signVerifiedTransfer({ intent, ...outcome, signer: honestSigner() });
    expect(signed.signedMessageFingerprint).toBe(outcome.prepared.fingerprint);
  });

  it("a wallet that appends Lighthouse assertions is refused, and the error says what it added", async () => {
    const outcome = await readyOutcome();
    const { calls } = createFakeRpc();
    const guarding: TransactionSignerPort = {
      modifyAndSignTransactions: async () => {
        const message = pipe(
          createTransactionMessage({ version: 0 }),
          (m) => setTransactionMessageFeePayer(wallet.address, m),
          (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: outcome.prepared.lifetime.blockhash as Blockhash, lastValidBlockHeight: outcome.prepared.lifetime.lastValidBlockHeight }, m),
          (m) => appendTransactionMessageInstruction(computeUnitLimitIx(1_000), m),
          (m) => appendTransactionMessageInstruction(computeUnitPriceIx(1n), m),
          (m) => appendTransactionMessageInstruction(transferIx(wallet.address, RECIPIENT, 100_000_000n), m),
          (m) => appendTransactionMessageInstruction(lighthouseIx(), m),
        );
        return [await partiallySignTransaction([wallet.keyPair], compileTransaction(message))];
      },
    };
    const attempt = signVerifiedTransfer({ intent, ...outcome, signer: guarding });
    await expect(attempt).rejects.toMatchObject({ code: "MESSAGE_CHANGED" });
    await expect(attempt).rejects.toThrow(/added Lighthouse safety assertions/);
    expect(calls.sendTransaction).toBeUndefined();
  });

  it("a wallet that MUTATES the message is blocked (MESSAGE_CHANGED) and nothing is sent", async () => {
    const outcome = await readyOutcome();
    const { port, calls } = createFakeRpc();
    const mutating: TransactionSignerPort = {
      modifyAndSignTransactions: async () => {
        // Wallet swaps in a different message (e.g. adds an instruction) and signs it.
        const message = pipe(
          createTransactionMessage({ version: 0 }),
          (m) => setTransactionMessageFeePayer(wallet.address, m),
          (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: TEST_BLOCKHASH as Blockhash, lastValidBlockHeight: 1_000n }, m),
          (m) => appendTransactionMessageInstruction(memoIx("priority"), m),
          (m) => appendTransactionMessageInstruction(transferIx(wallet.address, RECIPIENT, 100_000_000n), m),
        );
        return [await partiallySignTransaction([wallet.keyPair], compileTransaction(message))];
      },
    };
    await expect(signVerifiedTransfer({ intent, ...outcome, signer: mutating })).rejects.toMatchObject({ code: "MESSAGE_CHANGED" });
    expect(calls.sendTransaction).toBeUndefined();
    void port;
  });

  it("a signature that does not verify against the reviewed bytes is rejected", async () => {
    const outcome = await readyOutcome();
    const other = await generateKeyPairSigner();
    const forging: TransactionSignerPort = {
      modifyAndSignTransactions: async (txs) => {
        const signedByOther = await partiallySignTransaction([other.keyPair], {
          ...txs[0]!,
          signatures: { ...txs[0]!.signatures, [other.address]: null },
        } as Transaction);
        const forged = signedByOther.signatures[other.address];
        return [{ messageBytes: txs[0]!.messageBytes, signatures: { [wallet.address]: forged ?? null } } as Transaction];
      },
    };
    await expect(signVerifiedTransfer({ intent, ...outcome, signer: forging })).rejects.toMatchObject({ code: "SIGNATURE_INVALID" });
  });

  it("UT-16: wallet rejection → WALLET_REJECTED and no broadcast", async () => {
    const outcome = await readyOutcome();
    const { calls } = createFakeRpc();
    const rejecting: TransactionSignerPort = {
      modifyAndSignTransactions: async () => {
        throw Object.assign(new Error("User rejected the request."), { code: 4001 });
      },
    };
    const error = await signVerifiedTransfer({ intent, ...outcome, signer: rejecting }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SignBoundaryError);
    expect((error as SignBoundaryError).code).toBe("WALLET_REJECTED");
    expect(calls.sendTransaction).toBeUndefined();
  });

  it("refuses to open the wallet when the gate is closed (blocked verification)", async () => {
    const outcome = await readyOutcome();
    const signer = honestSigner();
    const blockedVerification = { ...outcome.verification, ok: false, status: "blocked" as const, reasons: ["AMOUNT_MISMATCH" as const] };
    await expect(
      signVerifiedTransfer({ intent, ...outcome, verification: blockedVerification, signer }),
    ).rejects.toMatchObject({ code: "GATE_CLOSED" });
    expect(signer.modifyAndSignTransactions).not.toHaveBeenCalled();
  });

  it("re-verifies at the boundary: bytes mutated after review never reach the wallet", async () => {
    const outcome = await readyOutcome();
    const signer = honestSigner();
    const mutated = Uint8Array.from(outcome.prepared.messageBytes);
    new DataView(mutated.buffer).setBigUint64(mutated.length - 8, 800_000_000n, true);
    const tamperedPrepared = { ...outcome.prepared, messageBytes: mutated };
    await expect(
      signVerifiedTransfer({ intent, ...outcome, prepared: tamperedPrepared, signer }),
    ).rejects.toMatchObject({ code: expect.stringMatching(/GATE_CLOSED|MESSAGE_CHANGED/) });
    expect(signer.modifyAndSignTransactions).not.toHaveBeenCalled();
  });

  it("UT-19: the signing lock allows one request per approval", () => {
    const lock = createSigningLock();
    expect(lock.acquire("approval-1")).toBe(true);
    expect(lock.acquire("approval-1")).toBe(false);
    expect(lock.acquire("approval-2")).toBe(false); // another request while one is in flight
    lock.release("approval-1");
    expect(lock.acquire("approval-1")).toBe(false); // never re-sign the same approval
    expect(lock.acquire("approval-2")).toBe(true);
  });
});

describe("submit + confirm (integration)", () => {
  it("broadcasts the verified bytes once and confirms only after RPC reports `confirmed`", async () => {
    const outcome = await readyOutcome();
    const signed = await signVerifiedTransfer({ intent, ...outcome, signer: honestSigner() });
    const rpc = createFakeRpc({
      sendResult: () => signed.signature,
      statuses: [null, { confirmationStatus: "processed", err: null, slot: 7n }, { confirmationStatus: "confirmed", err: null, slot: 8n }],
    });
    const submitted = await submitSignedTransfer(rpc.port, signed, outcome.prepared.lifetime.lastValidBlockHeight);
    expect(submitted).toEqual({ kind: "submitted", signature: signed.signature });
    expect(rpc.calls.sendTransaction).toBe(1);
    const sentMessage = getTransactionDecoder().decode(getBase64Encoder().encode(rpc.sent[0]!)).messageBytes;
    expect(decodeTransactionMessage(sentMessage).ok).toBe(true);
    expect(Uint8Array.from(sentMessage)).toEqual(outcome.prepared.messageBytes);

    const updates: string[] = [];
    const result = await waitForConfirmation(
      rpc.port,
      { signature: signed.signature, lastValidBlockHeight: outcome.prepared.lifetime.lastValidBlockHeight },
      { pollIntervalMs: 1, sleep: async () => undefined, onUpdate: (u) => updates.push(u.status) },
    );
    expect(updates).toEqual(["confirming", "confirming", "confirmed"]);
    expect(result.status).toBe("confirmed");
  });

  it("preflight rejection from the RPC is reported as not broadcast", async () => {
    const outcome = await readyOutcome();
    const signed = await signVerifiedTransfer({ intent, ...outcome, signer: honestSigner() });
    const rpc = createFakeRpc({
      sendResult: new RpcRequestError("rpc", "preflight", { InstructionError: [0, { Custom: 1 }] }),
    });
    expect(await submitSignedTransfer(rpc.port, signed, 1_000n)).toMatchObject({ kind: "rejected", code: "INSUFFICIENT_LAMPORTS" });
  });

  it("transport failure while sending → unknown + keep tracking the signed signature (no resend)", async () => {
    const outcome = await readyOutcome();
    const signed = await signVerifiedTransfer({ intent, ...outcome, signer: honestSigner() });
    const rpc = createFakeRpc({ sendResult: new RpcRequestError("transport", "socket hang up") });
    const result = await submitSignedTransfer(rpc.port, signed, 1_000n);
    expect(result).toMatchObject({ kind: "unknown", signature: signed.signature });
    expect(rpc.calls.sendTransaction).toBe(1);
  });

  it("does not broadcast once the blockhash lifetime has passed", async () => {
    const outcome = await readyOutcome();
    const signed = await signVerifiedTransfer({ intent, ...outcome, signer: honestSigner() });
    const rpc = createFakeRpc({ blockHeight: 2_000n, sendResult: () => signed.signature });
    expect((await submitSignedTransfer(rpc.port, signed, 1_000n)).kind).toBe("expired");
    expect(rpc.calls.sendTransaction).toBeUndefined();
  });

  it("on-chain error → onchain_failed; never-seen + expired lifetime → expired; timeout → unknown", async () => {
    const failed = createFakeRpc({ statuses: [{ confirmationStatus: "confirmed", err: { InstructionError: [0, { Custom: 1 }] }, slot: 9n }] });
    expect((await waitForConfirmation(failed.port, { signature: "s", lastValidBlockHeight: 1_000n }, { sleep: async () => undefined })).status).toBe(
      "onchain_failed",
    );

    const expired = createFakeRpc({ statuses: [null], blockHeight: 1_001n });
    expect((await waitForConfirmation(expired.port, { signature: "s", lastValidBlockHeight: 1_000n }, { sleep: async () => undefined })).status).toBe(
      "expired",
    );

    let clock = 0;
    const pending = createFakeRpc({ statuses: [null] });
    const result = await waitForConfirmation(
      pending.port,
      { signature: "s", lastValidBlockHeight: 1_000n },
      { sleep: async () => undefined, timeoutMs: 50, now: () => (clock += 20) },
    );
    expect(result.status).toBe("unknown");
  });
});
