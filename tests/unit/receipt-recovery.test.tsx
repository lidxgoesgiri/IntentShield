// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ErrorBoundary from "@/app/error";
import { ReceiptLookup } from "@/features/receipt/components/receipt-lookup";
import { ReceiptCard, type ReceiptCardData } from "@/features/receipt/components/receipt-card";
import { TransactionRecovery } from "@/features/receipt/components/transaction-recovery";
import { loadReceipt, type ReceiptLookup as Lookup } from "@/features/receipt/lib/load-receipt";
import { forgetTransactionSignature, readRecoverableSignature, rememberTransactionSignature } from "@/features/receipt/lib/transaction-recovery";
import { OTHER, SENDER } from "@/test/fixtures/solana";

vi.mock("@/features/receipt/lib/load-receipt", () => ({ loadReceipt: vi.fn() }));
vi.mock("@/lib/solana/client", () => ({ getRpcPort: () => ({}) }));

const SIGNATURE = "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW";
const OTHER_SIGNATURE = `4${SIGNATURE.slice(1)}`;
const pending: Lookup = { kind: "found", status: "confirming", confirmationStatus: "processed", slot: 1n, blockTime: null, feeLamports: null, error: null, transfer: null };
const finalized: Lookup = { ...pending, status: "confirmed", confirmationStatus: "finalized", feeLamports: 5001n, blockTime: 100n };

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("receipt polling and public-signature recovery", () => {
  it("ends pending polling honestly and can retry to a finalized receipt without a wallet", async () => {
    vi.useFakeTimers();
    vi.mocked(loadReceipt).mockResolvedValue(pending);
    render(<ReceiptLookup signature={SIGNATURE} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(loadReceipt).toHaveBeenCalledTimes(20);
    expect(screen.getByText("Confirmation unknown — automatic checks paused")).toBeVisible();
    expect(screen.getByText("Unknown", { exact: true })).toBeVisible();
    expect(screen.queryByText("Waiting for the network to confirm…")).not.toBeInTheDocument();
    vi.mocked(loadReceipt).mockResolvedValue(finalized);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Check again" })); });
    expect(screen.getByText("Finalized", { exact: true })).toBeVisible();
    expect(screen.getByText("Actual network fee")).toBeVisible();
    const count = vi.mocked(loadReceipt).mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(loadReceipt).toHaveBeenCalledTimes(count);
  });

  it("offers retry when an unseen signature reaches the polling limit", async () => {
    vi.useFakeTimers();
    vi.mocked(loadReceipt).mockResolvedValue({ kind: "not_found" });
    render(<ReceiptLookup signature={SIGNATURE} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(screen.getByText("Status unknown — automatic checks paused")).toBeVisible();
    expect(screen.getByRole("button", { name: "Check again" })).toBeEnabled();
    expect(screen.getByRole("link", { name: /Check Solana Explorer/ })).toHaveAttribute("href", expect.stringContaining(SIGNATURE));
  });

  it("keeps an independent Explorer link during RPC outage and refreshes after connectivity returns", async () => {
    vi.mocked(loadReceipt).mockResolvedValueOnce({ kind: "unavailable", message: "Devnet RPC is unavailable." }).mockResolvedValue(finalized);
    render(<ReceiptLookup signature={SIGNATURE} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText("Status unavailable")).toBeVisible();
    expect(screen.getByRole("link", { name: /Check Solana Explorer/ })).toHaveAttribute("href", expect.stringContaining(SIGNATURE));
    await act(async () => { window.dispatchEvent(new Event("online")); });
    expect(screen.getByText("Finalized", { exact: true })).toBeVisible();
    expect(loadReceipt).toHaveBeenCalledTimes(2);
    await act(async () => { window.dispatchEvent(new Event("online")); });
    expect(loadReceipt).toHaveBeenCalledTimes(2);
  });

  it("retains an observed confirmation with a stale notice if a metadata refresh loses the RPC", async () => {
    vi.useFakeTimers();
    vi.mocked(loadReceipt)
      .mockResolvedValueOnce({ ...pending, status: "confirmed", confirmationStatus: "confirmed" })
      .mockResolvedValueOnce({ kind: "unavailable", message: "RPC temporarily unavailable" })
      .mockResolvedValue(finalized);
    render(<ReceiptLookup signature={SIGNATURE} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText("Confirmed", { exact: true })).toBeVisible();
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(screen.getByText("Showing the last observed receipt")).toBeVisible();
    expect(screen.getByText("Confirmed", { exact: true })).toBeVisible();
    expect(screen.queryByText("Status unavailable")).not.toBeInTheDocument();
    await act(async () => { window.dispatchEvent(new Event("online")); });
    expect(screen.getByText("Finalized", { exact: true })).toBeVisible();
    expect(screen.queryByText("Showing the last observed receipt")).not.toBeInTheDocument();
  });

  it("does not erase an observed confirmation when another RPC response is temporarily not found", async () => {
    vi.useFakeTimers();
    vi.mocked(loadReceipt)
      .mockResolvedValueOnce({ ...pending, status: "confirmed", confirmationStatus: "confirmed" })
      .mockResolvedValueOnce({ kind: "not_found" })
      .mockResolvedValue(finalized);
    render(<ReceiptLookup signature={SIGNATURE} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(screen.getByText("Confirmed", { exact: true })).toBeVisible();
    expect(screen.getByText("Showing the last observed receipt")).toBeVisible();
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(screen.getByText("Finalized", { exact: true })).toBeVisible();
    expect(screen.queryByText("Showing the last observed receipt")).not.toBeInTheDocument();
  });

  it.each([
    ["confirmed", "Confirmed"],
    ["onchain_failed", "Failed on chain"],
  ] as const)("retains the observed %s receipt during a manual retry that also fails", async (status, label) => {
    vi.useFakeTimers();
    let resolveRetry!: (result: Lookup) => void;
    const retryResponse = new Promise<Lookup>((resolve) => { resolveRetry = resolve; });
    vi.mocked(loadReceipt)
      .mockResolvedValueOnce({ ...pending, status, confirmationStatus: "confirmed", error: status === "onchain_failed" ? "Instruction failed" : null })
      .mockResolvedValueOnce({ kind: "unavailable", message: "First RPC outage" })
      .mockReturnValueOnce(retryResponse);
    render(<ReceiptLookup signature={SIGNATURE} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(screen.getByText(label, { exact: true })).toBeVisible();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Check again" })); });
    expect(screen.getByText(label, { exact: true })).toBeVisible();
    expect(screen.getByText(/A new RPC check is in progress/)).toBeVisible();
    await act(async () => { resolveRetry({ kind: "unavailable", message: "Second RPC outage" }); });
    expect(loadReceipt).toHaveBeenCalledTimes(3);
    expect(screen.getByText(label, { exact: true })).toBeVisible();
    expect(screen.getByText("Showing the last observed receipt")).toBeVisible();
    expect(screen.queryByText("Status unavailable")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check again" })).toBeEnabled();
  });

  it("retains finalized evidence across a lagging processed response and later enriches it from finalized metadata", async () => {
    vi.useFakeTimers();
    vi.mocked(loadReceipt)
      .mockResolvedValueOnce({ ...pending, status: "confirmed", confirmationStatus: "finalized" })
      .mockResolvedValueOnce({ ...pending, slot: 2n, feeLamports: 9_999n, blockTime: 200n })
      .mockResolvedValue(finalized);
    render(<ReceiptLookup signature={SIGNATURE} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(screen.getByText("Finalized", { exact: true })).toBeVisible();
    expect(screen.getByText(/The RPC returned a lower confirmation level/)).toBeVisible();
    expect(screen.queryByText("0.000009999 SOL")).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(screen.getByText("Finalized", { exact: true })).toBeVisible();
    expect(screen.getByText("0.000005001 SOL")).toBeVisible();
    expect(screen.queryByText("Showing the last observed receipt")).not.toBeInTheDocument();
  });

  it.each([
    ["confirmed", "Confirmed"],
    ["onchain_failed", "Failed on chain"],
  ] as const)("does not downgrade an observed %s outcome to a later processed response", async (status, label) => {
    vi.useFakeTimers();
    vi.mocked(loadReceipt)
      .mockResolvedValueOnce({ ...pending, status, confirmationStatus: "confirmed", error: status === "onchain_failed" ? "Instruction failed" : null })
      .mockResolvedValue(pending);
    render(<ReceiptLookup signature={SIGNATURE} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(screen.getByText(label, { exact: true })).toBeVisible();
    expect(screen.getByText("Showing the last observed receipt")).toBeVisible();
    expect(screen.queryByText("Confirming", { exact: true })).not.toBeInTheDocument();
  });

  it("does not silently relabel an observed on-chain failure as successful when RPC outcomes conflict", async () => {
    vi.useFakeTimers();
    vi.mocked(loadReceipt)
      .mockResolvedValueOnce({ ...pending, status: "onchain_failed", confirmationStatus: "confirmed", error: "Instruction failed" })
      .mockResolvedValue(finalized);
    render(<ReceiptLookup signature={SIGNATURE} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(screen.getByText("Failed on chain", { exact: true })).toBeVisible();
    expect(screen.getByText(/RPC responses disagree about the transaction outcome/)).toBeVisible();
    expect(screen.queryByText("Finalized", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("0.000005001 SOL")).not.toBeInTheDocument();
  });

  it("keeps a failed transaction's missing fee recoverable without relabeling the failure unknown", async () => {
    vi.useFakeTimers();
    vi.mocked(loadReceipt).mockResolvedValue({ ...pending, status: "onchain_failed", error: "Instruction failed" });
    render(<ReceiptLookup signature={SIGNATURE} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(loadReceipt).toHaveBeenCalledTimes(20);
    expect(screen.getByText("Failed on chain", { exact: true })).toBeVisible();
    expect(screen.getByText("Failed on chain — receipt details unavailable")).toBeVisible();
    expect(screen.getByRole("button", { name: "Check again" })).toBeEnabled();
    expect(screen.queryByText("Unknown", { exact: true })).not.toBeInTheDocument();
  });

  it("shows actual and estimated fee distinctly and labels finality from RPC evidence", () => {
    const data: ReceiptCardData = { status: "confirmed", signature: SIGNATURE, amountLamports: null, sender: null, recipient: null, feeLamports: 5001n, estimatedFeeLamports: 5000n, blockTime: 100n, slot: 1n, confirmationStatus: "finalized", error: null };
    render(<ReceiptCard data={data} />);
    expect(screen.getByText("Finalized", { exact: true })).toBeVisible();
    expect(screen.getByText("Estimated fee")).toBeVisible();
    expect(screen.getByText("Actual network fee")).toBeVisible();
    expect(screen.getByText("0.000005001 SOL")).toBeVisible();
    expect(screen.getByText(/0.000005 SOL/)).toBeVisible();
  });

  it("does not claim an unsupported transaction while its on-chain bytes are still unavailable", async () => {
    vi.mocked(loadReceipt).mockResolvedValue({ ...pending, status: "confirmed", confirmationStatus: "confirmed" });
    render(<ReceiptLookup signature={SIGNATURE} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText("Confirmed", { exact: true })).toBeVisible();
    expect(screen.queryByText("Not a single native SOL transfer")).not.toBeInTheDocument();
  });

  it("an error boundary does not guess status or expose a receipt without the originating wallet", () => {
    rememberTransactionSignature(SENDER, SIGNATURE);
    render(<ErrorBoundary error={new Error("private technical detail")} reset={vi.fn()} />);
    expect(screen.getByText(/This error does not establish whether a wallet request or transaction completed/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Open workspace" })).toHaveAttribute("href", "/app");
    expect(screen.queryByRole("link", { name: "Recover transaction receipt" })).not.toBeInTheDocument();
    expect(screen.queryByText(/No transaction was signed or sent/)).not.toBeInTheDocument();
    expect(screen.queryByText(/private technical detail/)).not.toBeInTheDocument();
  });

  it("isolates recovery across wallet A, wallet B, disconnect and reconnect without discarding an ambiguous signature", () => {
    rememberTransactionSignature(SENDER, SIGNATURE);
    const view = render(<TransactionRecovery walletAddress={SENDER} />);
    expect(screen.getByRole("link", { name: "Recover transaction receipt" })).toHaveAttribute("href", `/tx/${SIGNATURE}`);

    view.rerender(<TransactionRecovery walletAddress={OTHER} />);
    expect(screen.queryByRole("link", { name: "Recover transaction receipt" })).not.toBeInTheDocument();
    act(() => { rememberTransactionSignature(OTHER, OTHER_SIGNATURE); });
    expect(screen.getByRole("link", { name: "Recover transaction receipt" })).toHaveAttribute("href", `/tx/${OTHER_SIGNATURE}`);
    view.rerender(<TransactionRecovery walletAddress={null} />);
    expect(screen.queryByRole("link", { name: "Recover transaction receipt" })).not.toBeInTheDocument();
    expect(readRecoverableSignature(null)).toBeNull();
    expect(readRecoverableSignature(SENDER)).toBe(SIGNATURE);
    view.rerender(<TransactionRecovery walletAddress={SENDER} />);
    expect(screen.getByRole("link", { name: "Recover transaction receipt" })).toHaveAttribute("href", `/tx/${SIGNATURE}`);
    act(() => { forgetTransactionSignature(OTHER, SIGNATURE); });
    expect(readRecoverableSignature(OTHER)).toBe(OTHER_SIGNATURE);
    act(() => { forgetTransactionSignature(SENDER, SIGNATURE); });
    expect(screen.queryByRole("link", { name: "Recover transaction receipt" })).not.toBeInTheDocument();
    expect(readRecoverableSignature(OTHER)).toBe(OTHER_SIGNATURE);
  });

  it("never attributes a legacy ownerless or malformed entry to the connected wallet", () => {
    sessionStorage.setItem("intentshield:last-broadcast-signature", SIGNATURE);
    sessionStorage.setItem(`intentshield:devnet:last-broadcast-signature:${SENDER}`, JSON.stringify({ signature: SIGNATURE }));
    expect(readRecoverableSignature(SENDER)).toBeNull();
    expect(readRecoverableSignature(OTHER)).toBeNull();
    expect(readRecoverableSignature("invalid-address")).toBeNull();
    rememberTransactionSignature(SENDER, "invalid-signature");
    rememberTransactionSignature("invalid-address", SIGNATURE);
    const view = render(<TransactionRecovery walletAddress={SENDER} />);
    expect(screen.queryByRole("link", { name: "Recover transaction receipt" })).not.toBeInTheDocument();
    act(() => { rememberTransactionSignature(SENDER, SIGNATURE); });
    expect(sessionStorage.getItem("intentshield:last-broadcast-signature")).toBeNull();
    expect(screen.getByRole("link", { name: "Recover transaction receipt" })).toBeVisible();
    view.rerender(<TransactionRecovery walletAddress={SENDER} currentSignature={SIGNATURE} />);
    expect(screen.queryByRole("link", { name: "Recover transaction receipt" })).not.toBeInTheDocument();
  });

  it("continues safely when browser session storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("Unavailable", "SecurityError"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Unavailable", "SecurityError"); });
    expect(() => rememberTransactionSignature(SENDER, SIGNATURE)).not.toThrow();
    expect(() => forgetTransactionSignature(SENDER, SIGNATURE)).not.toThrow();
    expect(readRecoverableSignature(SENDER)).toBeNull();
    render(<TransactionRecovery walletAddress={SENDER} />);
    expect(screen.queryByRole("link", { name: "Recover transaction receipt" })).not.toBeInTheDocument();
  });
});
