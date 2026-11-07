// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductProvider, useProductContext } from "@/features/wallet/product-context";
import { checkDevnet, type NetworkCheck } from "@/lib/solana/network";
import { DEVNET_CONTEXT } from "@/test/fixtures/solana";

vi.mock("@/features/wallet/wallet-client", () => ({ getWalletClient: () => ({}) }));
vi.mock("@/lib/solana/client", () => ({ getRpcPort: () => ({}) }));
vi.mock("@/lib/solana/network", () => ({ checkDevnet: vi.fn() }));

let online = true;
beforeEach(() => {
  vi.clearAllMocks();
  online = true;
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
});

describe("network verification recovery", () => {
  it("retries a failed genesis check and remains unverified until the retry succeeds", async () => {
    vi.mocked(checkDevnet).mockResolvedValueOnce({ ok: false, reason: "RPC_UNAVAILABLE", message: "RPC unavailable", genesisHash: null });
    const hook = renderHook(() => useProductContext(), { wrapper: ProductProvider });
    await waitFor(() => expect(hook.result.current.devnet.state).toBe("unavailable"));
    let finish!: (result: NetworkCheck) => void;
    vi.mocked(checkDevnet).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    act(() => { hook.result.current.recheckDevnet(); });
    expect(hook.result.current.devnet.state).toBe("checking");
    await act(async () => { finish({ ok: true, context: DEVNET_CONTEXT }); });
    expect(hook.result.current.devnet.state).toBe("verified");
    expect(checkDevnet).toHaveBeenCalledTimes(2);
  });

  it("automatically rechecks Devnet when the browser reconnects", async () => {
    vi.mocked(checkDevnet).mockResolvedValue({ ok: true, context: DEVNET_CONTEXT });
    const hook = renderHook(() => useProductContext(), { wrapper: ProductProvider });
    await waitFor(() => expect(hook.result.current.devnet.state).toBe("verified"));
    act(() => { online = false; window.dispatchEvent(new Event("offline")); });
    expect(hook.result.current.online).toBe(false);
    const before = vi.mocked(checkDevnet).mock.calls.length;
    act(() => { online = true; window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(checkDevnet).toHaveBeenCalledTimes(before + 1));
    expect(hook.result.current.online).toBe(true);
    await waitFor(() => expect(hook.result.current.devnet.state).toBe("verified"));
  });
});
