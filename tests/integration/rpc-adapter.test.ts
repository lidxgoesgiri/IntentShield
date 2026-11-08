import { afterEach, describe, expect, it, vi } from "vitest";
import { createSolanaRpcPort } from "@/lib/solana/rpc";
import { submitSignedTransfer } from "@/features/transfer/lib/submit-transfer";
import type { SignedTransfer } from "@/features/transfer/types";

const SIGNATURE = "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW";
const rpcUrl = "https://rpc.example.test";
const signed = { signature: SIGNATURE, wireBase64: "AQID" } as SignedTransfer;

function mockRpc(result: unknown) {
  vi.stubGlobal("fetch", vi.fn(async (_input: unknown, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as { id: string };
    return Response.json({ jsonrpc: "2.0", id: request.id, result });
  }));
  return createSolanaRpcPort(rpcUrl);
}

afterEach(() => vi.unstubAllGlobals());

describe("real Kit RPC adapter rejects incomplete success evidence", () => {
  it("rejects base58 blockhash text that does not decode to exactly 32 bytes", async () => {
    const rpc = mockRpc({ context: { slot: 1 }, value: { blockhash: "1".repeat(44), lastValidBlockHeight: 100 } });
    await expect(rpc.getLatestBlockhash()).rejects.toMatchObject({ kind: "transport" });
  });

  it.each([{}, { logs: [] }, { err: undefined }, { err: null, unitsConsumed: -1 }, { err: null, logs: "success" }])(
    "does not turn malformed simulation %j into success", async (value) => {
      const rpc = mockRpc({ context: { slot: 1 }, value });
      await expect(rpc.simulateTransaction("AQID")).rejects.toMatchObject({ kind: "transport" });
    },
  );

  it("accepts explicit simulation success and integer fields", async () => {
    const rpc = mockRpc({ context: { slot: 1 }, value: { err: null, logs: ["success"], unitsConsumed: 450 } });
    await expect(rpc.simulateTransaction("AQID")).resolves.toEqual({ err: null, logs: ["success"], unitsConsumed: 450n });
  });

  it.each([
    { slot: 1, confirmationStatus: "confirmed" },
    { slot: 1, err: null, confirmationStatus: "invented" },
    { slot: -1, err: null, confirmationStatus: "confirmed" },
  ])("requires an explicit error field in signature status %j", async (status) => {
    const rpc = mockRpc({ context: { slot: 1 }, value: [status] });
    await expect(rpc.getSignatureStatus(SIGNATURE, { searchTransactionHistory: true })).rejects.toMatchObject({ kind: "transport" });
  });

  it.each([null, {}, { fee: 5000 }])("requires complete transaction metadata, not %j", async (meta) => {
    const rpc = mockRpc({ slot: 1, blockTime: 1, transaction: ["AQID", "base64"], meta });
    await expect(rpc.getTransaction(SIGNATURE)).rejects.toMatchObject({ kind: "transport" });
  });

  it("preserves explicit missing status and transaction values", async () => {
    await expect(mockRpc({ context: { slot: 1 }, value: [null] }).getSignatureStatus(SIGNATURE, { searchTransactionHistory: true })).resolves.toBeNull();
    await expect(mockRpc(null).getTransaction(SIGNATURE)).resolves.toBeNull();
  });
});

describe("submission ambiguity through Kit transport", () => {
  function mockSend(reply: () => Response | Promise<Response>) {
    let sends = 0;
    vi.stubGlobal("fetch", vi.fn(async (_input: unknown, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { id: string; method: string };
      if (request.method === "getBlockHeight") return Response.json({ jsonrpc: "2.0", id: request.id, result: 1 });
      sends += 1;
      return reply();
    }));
    return { rpc: createSolanaRpcPort(rpcUrl), sends: () => sends };
  }

  it.each([500, 502, 503, 429])("HTTP %s retains the signed signature and never resends", async (status) => {
    const { rpc, sends } = mockSend(() => new Response("upstream error", { status }));
    await expect(submitSignedTransfer(rpc, signed, 100n)).resolves.toMatchObject({ kind: "unknown", signature: SIGNATURE });
    expect(sends()).toBe(1);
  });

  it("recognizes Kit's numeric HTTP transport error code", async () => {
    const { rpc } = mockSend(() => new Response("unavailable", { status: 503 }));
    await expect(rpc.sendTransaction("AQID")).rejects.toMatchObject({ kind: "transport" });
  });

  it("a lost response retains the signature instead of claiming rejection", async () => {
    const { rpc, sends } = mockSend(() => { throw new TypeError("connection lost after upload"); });
    await expect(submitSignedTransfer(rpc, signed, 100n)).resolves.toMatchObject({ kind: "unknown", signature: SIGNATURE });
    expect(sends()).toBe(1);
  });

  it("AlreadyProcessed is checked on the original signature", async () => {
    const { rpc, sends } = mockSend(() => Response.json({
      jsonrpc: "2.0", id: "1", error: { code: -32002, message: "preflight", data: { err: "AlreadyProcessed", logs: [] } },
    }));
    await expect(submitSignedTransfer(rpc, signed, 100n)).resolves.toMatchObject({ kind: "unknown", signature: SIGNATURE, message: expect.stringContaining("already processed") });
    expect(sends()).toBe(1);
  });

  it("an explicit insufficient-funds preflight is still a definite rejection", async () => {
    const { rpc, sends } = mockSend(() => Response.json({
      jsonrpc: "2.0", id: "1", error: { code: -32002, message: "preflight", data: { err: { InstructionError: [0, { Custom: 1 }] }, logs: [] } },
    }));
    await expect(submitSignedTransfer(rpc, signed, 100n)).resolves.toMatchObject({ kind: "rejected", code: "INSUFFICIENT_LAMPORTS" });
    expect(sends()).toBe(1);
  });

  it("does not claim expiry when a lagging RPC cannot find a still-live blockhash", async () => {
    const { rpc, sends } = mockSend(() => Response.json({
      jsonrpc: "2.0", id: "1", error: { code: -32002, message: "preflight", data: { err: "BlockhashNotFound", logs: [] } },
    }));
    await expect(submitSignedTransfer(rpc, signed, 100n)).resolves.toMatchObject({ kind: "rejected", code: "BLOCKHASH_NOT_FOUND" });
    expect(sends()).toBe(1);
  });
});
