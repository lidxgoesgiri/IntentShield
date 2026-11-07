import { afterEach, describe, expect, it, vi } from "vitest";
import { readJsonBody } from "@/server/http";

function streamedBody(stream: ReadableStream<Uint8Array>, headers: Record<string, string> = {}) {
  return new Request("https://app.example.test/api", {
    method: "POST", body: stream, headers: { "Content-Type": "application/json", ...headers }, duplex: "half",
  } as RequestInit & { duplex: "half" });
}

afterEach(() => vi.useRealTimers());

describe("bounded JSON request reader", () => {
  it("accepts UTF-8 split across stream chunks", async () => {
    const bytes = new TextEncoder().encode('{"text":"café"}');
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    } });
    await expect(readJsonBody(streamedBody(stream))).resolves.toEqual({ ok: true, value: { text: "café" } });
  });

  it.each<Record<string, string>>([{}, { "content-length": "1" }])("cancels oversized chunked bodies even with headers %j", async (headers) => {
    let cancelled = false;
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { pulls += 1; controller.enqueue(new Uint8Array(2048)); },
      cancel() { cancelled = true; },
    });
    const result = await readJsonBody(streamedBody(stream, headers));
    expect(result.ok).toBe(false);
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThanOrEqual(4);
  });

  it("times out a body that never completes and cancels its reader", async () => {
    vi.useFakeTimers();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
    const result = readJsonBody(streamedBody(stream));
    await vi.advanceTimersByTimeAsync(5001);
    expect((await result).ok).toBe(false);
    expect(cancelled).toBe(true);
  });
});
