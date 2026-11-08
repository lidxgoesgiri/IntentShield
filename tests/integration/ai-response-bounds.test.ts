import { describe, expect, it, vi } from "vitest";
import { requestIntentParse } from "@/features/intent/lib/parse-intent-client";
import { fetchAiModels } from "@/features/intent/lib/ai-models-client";
import { requestVerificationExplanation } from "@/features/verification/services/explain-client";
import { AI_MAX_RESPONSE_BYTES, createChatCompletion } from "@/server/ai/client";
import { getAiConfig } from "@/server/ai/config";
import { parseIntentWithAi } from "@/server/ai/parse-intent";
import { createModelHealth } from "@/server/ai/models";

const config = getAiConfig({ OPENROUTER_API_KEY: "test-only", OPENROUTER_MODEL: "test/primary", OPENROUTER_MODELS: "test/fallback" });
const request = { model: "test/primary", messages: [{ role: "user" as const, content: "test" }] };
const summary = { status: "blocked" as const, reasons: ["AMOUNT_MISMATCH" as const], intendedAmountSol: "0.1", actualAmountSol: "0.8", recipientMatches: true, simulation: "not_run" as const, simulationErrorCode: null };

describe("AI response limits and cancellation", () => {
  it("cancels provider responses that exceed the decoded byte bound", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(AI_MAX_RESPONSE_BYTES + 1)); }, cancel }));
    await expect(createChatCompletion(config, request, async () => response)).rejects.toMatchObject({ kind: "bad_response" });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("applies the provider timeout to a stream stalled after headers", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }));
    await expect(createChatCompletion(config, { ...request, timeoutMs: 20 }, async () => response)).rejects.toMatchObject({ kind: "timeout" });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("does not call the provider or consume budget for an already cancelled operation", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn();
    const consumeBudget = vi.fn(() => true);
    await expect(parseIntentWithAi("Send 0.1 SOL", config, { signal: controller.signal, fetchImpl, consumeBudget })).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(consumeBudget).not.toHaveBeenCalled();
  });

  it("does not fall back or mark provider health on caller cancellation after headers", async () => {
    const controller = new AbortController();
    const health = createModelHealth();
    const fetchImpl = vi.fn(async () => {
      controller.abort();
      return Response.json({ choices: [{ message: { content: "{}" } }] });
    });
    await expect(parseIntentWithAi("Send 0.1 SOL", config, { signal: controller.signal, fetchImpl, health })).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(health.isCooling("test/primary")).toBe(false);
  });

  it("cancels discarded provider error bodies", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), { status: 429 });
    await expect(createChatCompletion(config, request, async () => response)).rejects.toMatchObject({ kind: "unavailable", status: 429 });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("bounds parse API response bodies independently on the client", async () => {
    const result = await requestIntentParse("Send 0.1 SOL", { online: true, fetchImpl: async () => new Response("x".repeat(16_385)) });
    expect(result).toMatchObject({ ok: false, kind: "invalid_response" });
  });

  it("bounds model-list and explanation API responses", async () => {
    const fetchImpl = async () => new Response("x".repeat(16_385));
    expect(await fetchAiModels({ fetchImpl })).toEqual({ ok: false });
    expect(await requestVerificationExplanation(summary, { fetchImpl })).toMatchObject({ ok: false });
  });

  it("does not show an empty AI note after stripping invisible-only output", async () => {
    expect(await requestVerificationExplanation(summary, { fetchImpl: async () => Response.json({ explanation: "\u200b\u202e" }) })).toMatchObject({ ok: false });
  });
});
