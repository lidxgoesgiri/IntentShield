// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTransferMachine } from "@/features/transfer/hooks/use-transfer-machine";
import { signVerifiedTransfer } from "@/features/transfer/lib/sign-transfer";
import { submitSignedTransfer, type SubmitOutcome } from "@/features/transfer/lib/submit-transfer";
import { waitForConfirmation } from "@/features/transfer/lib/confirm-transfer";
import { useConnectedWallet, type ConnectedWalletInfo } from "@/features/wallet/hooks/use-connected-wallet";
import { useProductContext } from "@/features/wallet/product-context";
import { readRecoverableSignature } from "@/features/receipt/lib/transaction-recovery";
import { getRpcPort } from "@/lib/solana/client";
import { createFakeRpc } from "@/test/mocks/fake-rpc";
import { DEVNET_CONTEXT, OTHER, RECIPIENT, SENDER } from "@/test/fixtures/solana";
import type { SignedTransfer } from "@/features/transfer/types";

vi.mock("@/features/wallet/hooks/use-connected-wallet", () => ({ useConnectedWallet: vi.fn() }));
vi.mock("@/features/wallet/product-context", () => ({ useProductContext: vi.fn() }));
vi.mock("@/lib/solana/client", () => ({ getRpcPort: vi.fn() }));
vi.mock("@/features/transfer/lib/sign-transfer", async (original) => ({ ...await original<typeof import("@/features/transfer/lib/sign-transfer")>(), signVerifiedTransfer: vi.fn() }));
vi.mock("@/features/transfer/lib/submit-transfer", () => ({ submitSignedTransfer: vi.fn() }));
vi.mock("@/features/transfer/lib/confirm-transfer", () => ({ waitForConfirmation: vi.fn() }));

const SIGNATURE = "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW";
const signed: SignedTransfer = { signature: SIGNATURE, wireBase64: "test-only", signedMessageFingerprint: "sha256:test", signedAt: 1 };
let wallet: ConnectedWalletInfo;
let rpc: ReturnType<typeof createFakeRpc>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  wallet = { status: "connected", ready: true, address: SENDER, walletName: "Test wallet", walletIcon: null, supportsDevnet: true, signer: { modifyAndSignTransactions: vi.fn() }, messageVersion: 0 };
  rpc = createFakeRpc();
  vi.mocked(useConnectedWallet).mockImplementation(() => wallet);
  vi.mocked(useProductContext).mockReturnValue({ devnet: { state: "verified", context: DEVNET_CONTEXT }, online: true, recheckDevnet: vi.fn() } as unknown as ReturnType<typeof useProductContext>);
  vi.mocked(getRpcPort).mockReturnValue(rpc.port);
  vi.mocked(signVerifiedTransfer).mockResolvedValue(signed);
  vi.mocked(submitSignedTransfer).mockResolvedValue({ kind: "submitted", signature: SIGNATURE });
  vi.mocked(waitForConfirmation).mockImplementation(async (_rpc, _target, options) => {
    const result = { status: "confirmed" as const, confirmationStatus: "confirmed" as const, slot: 12n, error: null };
    options?.onUpdate?.(result);
    return result;
  });
});

async function ready() {
  const hook = renderHook(() => useTransferMachine());
  act(() => {
    hook.result.current.actions.editDraft("amountSol", "0.1");
    hook.result.current.actions.editDraft("recipient", RECIPIENT);
  });
  await act(async () => { await hook.result.current.actions.approve(); });
  expect(hook.result.current.state.status).toBe("READY_TO_SIGN");
  return hook;
}

describe("transfer orchestration cancellation and recovery", () => {
  it("locks before delayed blockheight and never opens the wallet after an account switch", async () => {
    const hook = await ready();
    const height = deferred<bigint>();
    rpc.port.getBlockHeight = () => height.promise;
    let task!: Promise<void>;
    act(() => { task = hook.result.current.actions.sign(); });
    expect(hook.result.current.state.status).toBe("AWAITING_WALLET");
    act(() => { hook.result.current.actions.editDraft("amountSol", "0.9"); });
    expect(hook.result.current.state.draft.amountSol).toBe("0.1");
    wallet = { ...wallet, address: OTHER };
    hook.rerender();
    await act(async () => { height.resolve(1n); await task; });
    expect(signVerifiedTransfer).not.toHaveBeenCalled();
    expect(submitSignedTransfer).not.toHaveBeenCalled();
    expect(hook.result.current.state.approvedIntent).toBeNull();
  });

  it("does not broadcast a delayed wallet response after the account changed", async () => {
    const hook = await ready();
    const response = deferred<SignedTransfer>();
    vi.mocked(signVerifiedTransfer).mockReturnValue(response.promise);
    let task!: Promise<void>;
    act(() => { task = hook.result.current.actions.sign(); });
    await waitFor(() => expect(signVerifiedTransfer).toHaveBeenCalledTimes(1));
    wallet = { ...wallet, address: OTHER };
    hook.rerender();
    await act(async () => { response.resolve(signed); await task; });
    expect(submitSignedTransfer).not.toHaveBeenCalled();
    expect(readRecoverableSignature()).toBeNull();
  });

  it("releases a cancelled approval lock even when the old wallet ignores abort", async () => {
    const hook = await ready();
    const oldResponse = deferred<SignedTransfer>();
    vi.mocked(signVerifiedTransfer).mockReturnValueOnce(oldResponse.promise);
    let oldTask!: Promise<void>;
    act(() => { oldTask = hook.result.current.actions.sign(); });
    await waitFor(() => expect(signVerifiedTransfer).toHaveBeenCalledTimes(1));

    wallet = { ...wallet, address: OTHER, signer: { modifyAndSignTransactions: vi.fn() } };
    hook.rerender();
    expect(hook.result.current.state.approvedIntent).toBeNull();
    act(() => {
      hook.result.current.actions.editDraft("amountSol", "0.2");
      hook.result.current.actions.editDraft("recipient", RECIPIENT);
    });
    await act(async () => { await hook.result.current.actions.approve(); });
    expect(hook.result.current.state.status).toBe("READY_TO_SIGN");

    // The cancelled wallet promise remains unresolved: it must not hold the
    // new account's approval hostage while that wallet ignores AbortSignal.
    await act(async () => { await hook.result.current.actions.sign(); });
    expect(signVerifiedTransfer).toHaveBeenCalledTimes(2);
    expect(submitSignedTransfer).toHaveBeenCalledTimes(1);

    await act(async () => { oldResponse.resolve(signed); await oldTask; });
    expect(submitSignedTransfer).toHaveBeenCalledTimes(1);
  });

  it("preserves a broadcast signature across disconnect and enriches a confirmed receipt with actual fees", async () => {
    const hook = await ready();
    const sent = deferred<SubmitOutcome>();
    vi.mocked(submitSignedTransfer).mockReturnValue(sent.promise);
    rpc.port.getTransaction = async () => ({ slot: 12n, blockTime: 100n, fee: 5001n, err: null, wireBase64: "test-only" });
    let task!: Promise<void>;
    act(() => { task = hook.result.current.actions.sign(); });
    await waitFor(() => expect(submitSignedTransfer).toHaveBeenCalledTimes(1));
    expect(readRecoverableSignature()).toBe(SIGNATURE);
    expect(hook.result.current.state.receipt?.signature).toBe(SIGNATURE);
    wallet = { ...wallet, address: null, signer: null };
    hook.rerender();
    await act(async () => { sent.resolve({ kind: "unknown", signature: SIGNATURE, message: "Response lost" }); await task; });
    expect(waitForConfirmation).toHaveBeenCalledTimes(1);
    expect(hook.result.current.state.status).toBe("CONFIRMED");
    expect(hook.result.current.state.receipt).toMatchObject({ signature: SIGNATURE, feeLamports: 5001n, estimatedFeeLamports: 5000n, blockTime: 100n });
    expect(readRecoverableSignature()).toBe(SIGNATURE);
  });

  it("double clicks request one signature and one broadcast", async () => {
    const hook = await ready();
    await act(async () => { await Promise.all([hook.result.current.actions.sign(), hook.result.current.actions.sign()]); });
    expect(signVerifiedTransfer).toHaveBeenCalledTimes(1);
    expect(submitSignedTransfer).toHaveBeenCalledTimes(1);
  });

  it("loads actual fees for an on-chain failure", async () => {
    const hook = await ready();
    vi.mocked(waitForConfirmation).mockImplementationOnce(async (_rpc, _target, options) => {
      const failed = { status: "onchain_failed" as const, confirmationStatus: "confirmed" as const, slot: 12n, error: "Network reported an instruction error." };
      options?.onUpdate?.(failed);
      return failed;
    });
    rpc.port.getTransaction = async () => ({ slot: 12n, blockTime: 100n, fee: 5001n, err: "InstructionError", wireBase64: "test-only" });
    await act(async () => { await hook.result.current.actions.sign(); });
    expect(hook.result.current.state.status).toBe("ONCHAIN_FAILED");
    expect(hook.result.current.state.receipt?.feeLamports).toBe(5001n);
  });

  it("does not hold the signing lock while optional metadata for a completed transfer is pending", async () => {
    const hook = await ready();
    const metadata = deferred<Awaited<ReturnType<typeof rpc.port.getTransaction>>>();
    rpc.port.getTransaction = vi.fn().mockImplementationOnce(() => metadata.promise).mockResolvedValue(null);
    let oldTask!: Promise<void>;
    act(() => { oldTask = hook.result.current.actions.sign(); });
    await waitFor(() => expect(hook.result.current.state.status).toBe("CONFIRMED"));
    act(() => {
      hook.result.current.actions.reset();
      hook.result.current.actions.editDraft("amountSol", "0.2");
      hook.result.current.actions.editDraft("recipient", RECIPIENT);
    });
    await act(async () => { await hook.result.current.actions.approve(); });
    await act(async () => { await hook.result.current.actions.sign(); });
    expect(signVerifiedTransfer).toHaveBeenCalledTimes(2);
    expect(submitSignedTransfer).toHaveBeenCalledTimes(2);
    await act(async () => { metadata.resolve(null); await oldTask; });
  });
});
