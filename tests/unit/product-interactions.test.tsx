// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IntentComposer } from "@/features/intent/components/intent-composer";
import { ManualTransferFields } from "@/features/intent/components/manual-transfer-fields";
import type { AiModelsState } from "@/features/intent/hooks/use-ai-models";
import { useBalance } from "@/features/wallet/hooks/use-balance";
import { getRpcPort } from "@/lib/solana/client";
import { CopyButton } from "@/components/ui/copy-button";
import { OTHER, RECIPIENT, SENDER } from "@/test/fixtures/solana";

vi.mock("@/lib/solana/client", () => ({ getRpcPort: vi.fn() }));
vi.mock("@/features/intent/components/model-switcher", () => ({ ModelSwitcher: () => null }));
const getBalance = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.mocked(getRpcPort).mockReturnValue({ getBalance } as unknown as ReturnType<typeof getRpcPort>);
});
afterEach(() => vi.restoreAllMocks());

describe("wallet balance isolation and recovery", () => {
  it("never displays account A's balance while waiting for account B", async () => {
    let resolveB!: (value: bigint) => void;
    getBalance.mockResolvedValueOnce(100n).mockImplementationOnce(() => new Promise<bigint>(resolve => { resolveB = resolve; }));
    const hook = renderHook(({ address }) => useBalance(address), { initialProps: { address: SENDER as string } });
    await waitFor(() => expect(hook.result.current.balance).toMatchObject({ status: "ok", lamports: 100n }));
    hook.rerender({ address: OTHER });
    expect(hook.result.current.balance).toEqual({ status: "loading" });
    await act(async () => { resolveB(200n); });
    expect(hook.result.current.balance).toMatchObject({ status: "ok", lamports: 200n });
  });

  it("ignores a late response from the disconnected wallet", async () => {
    let resolveOld!: (value: bigint) => void;
    getBalance.mockImplementationOnce(() => new Promise<bigint>(resolve => { resolveOld = resolve; })).mockResolvedValueOnce(200n);
    const hook = renderHook(({ address }) => useBalance(address), { initialProps: { address: SENDER as string | null } });
    hook.rerender({ address: OTHER });
    await waitFor(() => expect(hook.result.current.balance).toMatchObject({ status: "ok", lamports: 200n }));
    await act(async () => { resolveOld(999n); });
    expect(hook.result.current.balance).toMatchObject({ status: "ok", lamports: 200n });
    hook.rerender({ address: null });
    expect(hook.result.current.balance).toEqual({ status: "idle" });
  });

  it("does not query while Devnet is unverified and can retry a failed balance read", async () => {
    getBalance.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(300n);
    const hook = renderHook(({ enabled }) => useBalance(SENDER, 20_000, enabled), { initialProps: { enabled: false } });
    expect(getBalance).not.toHaveBeenCalled();
    hook.rerender({ enabled: true });
    await waitFor(() => expect(hook.result.current.balance.status).toBe("unavailable"));
    act(() => hook.result.current.refresh());
    expect(hook.result.current.balance.status).toBe("loading");
    await waitFor(() => expect(hook.result.current.balance).toMatchObject({ status: "ok", lamports: 300n }));
  });
});

describe("intent entry interactions", () => {
  const ai = { status: "ready", models: [], selectedModel: null, defaultModel: null, select: vi.fn(), retry: vi.fn(), labelFor: () => "Default" } satisfies AiModelsState;
  it("does not silently join recipient fragments separated by whitespace", () => {
    const onChange = vi.fn();
    render(<ManualTransferFields amountSol="0.1" recipient="" source="manual" errors={{}} showErrors={{ amountSol: false, recipient: false }} disabled={false} onChange={onChange} />);
    const fragment = `${RECIPIENT.slice(0, 10)} ${RECIPIENT.slice(10)}`;
    fireEvent.change(screen.getByLabelText("Recipient address (full)"), { target: { value: ` ${fragment} ` } });
    expect(onChange).toHaveBeenLastCalledWith("recipient", ` ${fragment} `);
  });

  it("exposes real cancellation while parsing and blocks repeated keyboard analysis", () => {
    const onAnalyze = vi.fn();
    const onCancel = vi.fn();
    render(<IntentComposer text={`Send 0.1 SOL to ${RECIPIENT}`} onTextChange={vi.fn()} onAnalyze={onAnalyze} onCancel={onCancel} onManual={vi.fn()} parsing disabled aiDisabledReason={null} notice={null} ai={ai} />);
    fireEvent.keyDown(screen.getByLabelText("Describe the transfer"), { key: "Enter", ctrlKey: true });
    expect(onAnalyze).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel analysis" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

describe("clipboard feedback identity", () => {
  it("shows visible failure feedback when clipboard access is rejected", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    render(<CopyButton value={SENDER} label="wallet address" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy wallet address" }));
    await screen.findByRole("button", { name: "Copy failed — retry wallet address" });
    expect(screen.getAllByText("Copy failed").some(node => !node.classList.contains("sr-only"))).toBe(true);
  });
  it("does not label a changed wallet address as already copied", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const view = render(<CopyButton value={SENDER} label="wallet address" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy wallet address" }));
    await screen.findByRole("button", { name: "wallet address copied" });
    view.rerender(<CopyButton value={OTHER} label="wallet address" />);
    expect(screen.getByRole("button", { name: "Copy wallet address" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "wallet address copied" })).toBeNull();
  });
});
