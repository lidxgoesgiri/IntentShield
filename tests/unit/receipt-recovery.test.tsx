// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ErrorBoundary from "@/app/error";
import { ReceiptLookup } from "@/features/receipt/components/receipt-lookup";
import { ReceiptCard, type ReceiptCardData } from "@/features/receipt/components/receipt-card";
import { loadReceipt, type ReceiptLookup as Lookup } from "@/features/receipt/lib/load-receipt";
import { forgetTransactionSignature, readRecoverableSignature, rememberTransactionSignature } from "@/features/receipt/lib/transaction-recovery";

vi.mock("@/features/receipt/lib/load-receipt", () => ({ loadReceipt: vi.fn() }));
vi.mock("@/lib/solana/client", () => ({ getRpcPort: () => ({}) }));

const SIGNATURE = "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW";
const pending: Lookup = { kind: "found", status: "confirming", confirmationStatus: "processed", slot: 1n, blockTime: null, feeLamports: null, error: null, transfer: null };
const finalized: Lookup = { ...pending, status: "confirmed", confirmationStatus: "finalized", feeLamports: 5001n, blockTime: 100n };

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});
afterEach(() => { vi.useRealTimers(); });

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

  it("an error boundary does not assert a send failed and recovers only validated public signatures", () => {
    rememberTransactionSignature("invalid-signature");
    expect(readRecoverableSignature()).toBeNull();
    rememberTransactionSignature(SIGNATURE);
    render(<ErrorBoundary error={new Error("private technical detail")} reset={vi.fn()} />);
    expect(screen.getByText(/This error does not establish whether a wallet request or transaction completed/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Recover transaction receipt" })).toHaveAttribute("href", `/tx/${SIGNATURE}`);
    expect(screen.queryByText(/No transaction was signed or sent/)).not.toBeInTheDocument();
    expect(screen.queryByText(/private technical detail/)).not.toBeInTheDocument();
    act(() => { forgetTransactionSignature(SIGNATURE); });
    expect(screen.queryByRole("link", { name: "Recover transaction receipt" })).not.toBeInTheDocument();
  });
});
