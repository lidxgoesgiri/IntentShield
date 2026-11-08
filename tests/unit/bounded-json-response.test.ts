import { describe, expect, it, vi } from "vitest";
import { readBoundedJson } from "@/lib/http/read-bounded-json";

describe("bounded JSON response reader", () => {
  it("reads streamed UTF-8 across a multibyte boundary", async () => {
    const bytes = new TextEncoder().encode('{"text":"€"}');
    const response = new Response(new ReadableStream({ start(controller) {
      controller.enqueue(bytes.slice(0, 10));
      controller.enqueue(bytes.slice(10));
      controller.close();
    } }));
    expect(await readBoundedJson(response, { maxBytes: 64, signal: new AbortController().signal })).toEqual({ text: "€" });
  });

  it("cancels an oversized chunked body before consuming another chunk", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(65)); }, cancel }));
    await expect(readBoundedJson(response, { maxBytes: 64, signal: new AbortController().signal })).rejects.toThrow("byte limit");
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("rejects an excessive declared length without starting body consumption", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), { headers: { "content-length": "1000" } });
    await expect(readBoundedJson(response, { maxBytes: 64, signal: new AbortController().signal })).rejects.toThrow("byte limit");
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("aborts a body stalled after headers and releases its reader", async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }));
    const result = readBoundedJson(response, { maxBytes: 64, signal: controller.signal });
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(response.body?.locked).toBe(false);
  });

  it("does not read a body when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const response = Response.json({ ok: true });
    await expect(readBoundedJson(response, { maxBytes: 64, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(response.bodyUsed).toBe(false);
  });

  it("rejects malformed UTF-8 rather than changing its meaning", async () => {
    const response = new Response(new Uint8Array([123, 34, 120, 34, 58, 34, 0xff, 34, 125]));
    await expect(readBoundedJson(response, { maxBytes: 64, signal: new AbortController().signal })).rejects.toThrow();
  });
});
