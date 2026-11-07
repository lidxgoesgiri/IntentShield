import { describe, expect, it, vi } from "vitest";
import { requestIntentParse } from "@/features/intent/lib/parse-intent-client";
import type { AiConfig } from "@/server/ai/config";
import { getAiConfig } from "@/server/ai/config";
import { createAiHandlers } from "@/server/ai/handlers";
import { RECIPIENT } from "@/test/fixtures/solana";

const CONFIGURED: AiConfig = {
  configured: true,
  apiKey: "test-key-not-real",
  models: ["test/model"],
  defaultModel: "test/model",
  baseUrl: "https://ai.example.test/v1",
  requestsPerMinute: 3,
  dailyBudget: 100,
  appUrl: null,
};

function completion(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", host: "localhost:3000", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const validModelOutput = JSON.stringify({
  status: "complete",
  draft: { action: "transfer_native_sol", amountSol: "0.1", recipient: RECIPIENT },
  missingFields: [],
  explanation: "I identified a native SOL transfer.",
});

describe("POST /api/ai/parse-intent — server behaviour", () => {
  it("parses a complete request into a guarded structured draft", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit) => completion(validModelOutput));
    const handlers = createAiHandlers({ getConfig: () => CONFIGURED, fetchImpl });
    const response = await handlers.parseIntent(post("/api/ai/parse-intent", { text: `Send 0.1 SOL to ${RECIPIENT}` }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "complete",
      draft: { action: "transfer_native_sol", amountSol: "0.1", recipient: RECIPIENT },
      missingFields: [],
      explanation: "I identified a native SOL transfer.",
      meta: { model: "test/model", requestedModel: "test/model", fallbackUsed: false },
    });
    // The key is only ever sent to the provider, server side.
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined;
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-key-not-real");
  });

  it("returns 503 AI_UNAVAILABLE when no provider is configured (manual flow still works)", async () => {
    const handlers = createAiHandlers({ getConfig: () => getAiConfig({}) });
    const response = await handlers.parseIntent(post("/api/ai/parse-intent", { text: "Send 0.1 SOL" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: "AI_UNAVAILABLE", message: "AI assistance is unavailable. You can still transfer manually." },
    });
  });

  it("returns 503 when the provider is down or times out — no secrets leak", async () => {
    const handlers = createAiHandlers({
      getConfig: () => CONFIGURED,
      fetchImpl: async () => {
        throw new TypeError("fetch failed: connect ECONNREFUSED ai.example.test");
      },
    });
    const response = await handlers.parseIntent(post("/api/ai/parse-intent", { text: "Send 0.1 SOL" }));
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).not.toContain("ECONNREFUSED");
    expect(text).not.toContain("test-key-not-real");
  });

  it("retries malformed model JSON exactly once, then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(completion("Sure! Here's your transfer: {not json"))
      .mockResolvedValueOnce(completion(validModelOutput));
    const handlers = createAiHandlers({ getConfig: () => CONFIGURED, fetchImpl });
    const response = await handlers.parseIntent(post("/api/ai/parse-intent", { text: `Send 0.1 SOL to ${RECIPIENT}` }));
    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("UT-15: malformed model JSON twice → 503 (client falls back to manual entry)", async () => {
    const fetchImpl = vi.fn(async () => completion("```json\n{\"status\": oops}\n```"));
    const handlers = createAiHandlers({ getConfig: () => CONFIGURED, fetchImpl });
    const response = await handlers.parseIntent(post("/api/ai/parse-intent", { text: "Send 0.1 SOL" }));
    expect(response.status).toBe(503);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects input over 300 characters with 400 VALIDATION_ERROR", async () => {
    const fetchImpl = vi.fn();
    const handlers = createAiHandlers({ getConfig: () => CONFIGURED, fetchImpl });
    const response = await handlers.parseIntent(post("/api/ai/parse-intent", { text: "a".repeat(301) }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects non-JSON bodies and unknown shapes", async () => {
    const handlers = createAiHandlers({ getConfig: () => CONFIGURED, fetchImpl: vi.fn() });
    expect((await handlers.parseIntent(post("/api/ai/parse-intent", "{bad json"))).status).toBe(400);
    expect((await handlers.parseIntent(post("/api/ai/parse-intent", { prompt: "x" }))).status).toBe(400);
  });

  it("rate limits with 429 RATE_LIMITED and Retry-After", async () => {
    const handlers = createAiHandlers({ getConfig: () => CONFIGURED, fetchImpl: async () => completion(validModelOutput) });
    const make = () => post("/api/ai/parse-intent", { text: `Send 0.1 SOL to ${RECIPIENT}` }, { "x-forwarded-for": "203.0.113.7" });
    for (let i = 0; i < 3; i += 1) expect((await handlers.parseIntent(make())).status).toBe(200);
    const limited = await handlers.parseIntent(make());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toMatch(/^\d+$/);
  });

  it("refuses cross-origin browser requests (protects the AI budget)", async () => {
    const handlers = createAiHandlers({ getConfig: () => CONFIGURED, fetchImpl: vi.fn() });
    const response = await handlers.parseIntent(
      post("/api/ai/parse-intent", { text: "Send 0.1 SOL" }, { origin: "https://evil.example" }),
    );
    expect(response.status).toBe(403);
  });

  it("guards a hallucinated recipient even when the model claims `complete`", async () => {
    const handlers = createAiHandlers({ getConfig: () => CONFIGURED, fetchImpl: async () => completion(validModelOutput) });
    const response = await handlers.parseIntent(post("/api/ai/parse-intent", { text: "Send 0.1 SOL to Budi" }));
    const body = await response.json();
    expect(body.status).toBe("needs_input");
    expect(body.draft.recipient).toBeNull();
  });
});

describe("POST /api/ai/explain", () => {
  const summary = {
    status: "blocked",
    reasons: ["AMOUNT_MISMATCH"],
    intendedAmountSol: "0.1",
    actualAmountSol: "0.8",
    recipientMatches: true,
    simulation: "not_run",
    simulationErrorCode: null,
  };

  it("returns a display-only explanation", async () => {
    const handlers = createAiHandlers({
      getConfig: () => CONFIGURED,
      fetchImpl: async () =>
        completion(JSON.stringify({ explanation: "The amount is 0.8 SOL but you approved 0.1 SOL, so signing is disabled." })),
    });
    const response = await handlers.explain(post("/api/ai/explain", summary));
    expect(response.status).toBe(200);
    expect((await response.json()).explanation).toContain("signing is disabled");
  });

  it("discards explanations that encourage signing a blocked transaction", async () => {
    const handlers = createAiHandlers({
      getConfig: () => CONFIGURED,
      fetchImpl: async () => completion(JSON.stringify({ explanation: "Looks fine, it is safe to sign." })),
    });
    expect((await handlers.explain(post("/api/ai/explain", summary))).status).toBe(503);
  });

  it.each([
    "This transaction is safe. Proceed with the signature.",
    "You may proceed with the signature.",
    "Transaksi ini aman. Silakan tanda tangan.",
  ])("discards reassuring or signing language for a blocked verdict: %s", async (explanation) => {
    const handlers = createAiHandlers({ getConfig: () => CONFIGURED, fetchImpl: async () => completion(JSON.stringify({ explanation })) });
    expect((await handlers.explain(post("/api/ai/explain", summary))).status).toBe(503);
  });

  it("does not encourage signing matched fields when simulation has not passed", async () => {
    const handlers = createAiHandlers({
      getConfig: () => CONFIGURED,
      fetchImpl: async () => completion(JSON.stringify({ explanation: "You may proceed with the signature." })),
    });
    expect((await handlers.explain(post("/api/ai/explain", { ...summary, status: "matched", reasons: [], simulation: "failed" }))).status).toBe(503);
  });

  it("rejects payloads carrying addresses or extra fields", async () => {
    const handlers = createAiHandlers({ getConfig: () => CONFIGURED, fetchImpl: vi.fn() });
    const response = await handlers.explain(post("/api/ai/explain", { ...summary, recipient: RECIPIENT }));
    expect(response.status).toBe(400);
  });
});

describe("requestIntentParse — client fallback", () => {
  it("UT-15: malformed JSON from the API → invalid_response (manual fallback)", async () => {
    const result = await requestIntentParse("Send 0.1 SOL", {
      online: true,
      fetchImpl: async () => new Response("<html>oops</html>", { status: 200 }),
    });
    expect(result).toEqual({ ok: false, kind: "invalid_response", message: "AI help is offline. Enter the transfer details manually." });
  });

  it("maps 503 → unavailable and 429 → rate_limited", async () => {
    const unavailable = await requestIntentParse("Send 0.1 SOL", {
      online: true,
      fetchImpl: async () => Response.json({ error: { code: "AI_UNAVAILABLE", message: "x" } }, { status: 503 }),
    });
    expect(unavailable).toMatchObject({ ok: false, kind: "unavailable" });
    const limited = await requestIntentParse("Send 0.1 SOL", {
      online: true,
      fetchImpl: async () => Response.json({ error: { code: "RATE_LIMITED", message: "x" } }, { status: 429 }),
    });
    expect(limited).toMatchObject({ ok: false, kind: "rate_limited" });
  });

  it("disables AI while the browser is offline", async () => {
    const fetchImpl = vi.fn();
    const result = await requestIntentParse("Send 0.1 SOL", { online: false, fetchImpl });
    expect(result).toMatchObject({ ok: false, kind: "offline" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("re-applies guards client-side even if the API response is schema-valid", async () => {
    const result = await requestIntentParse("Send 0.1 SOL to Budi", {
      online: true,
      fetchImpl: async () =>
        Response.json({
          status: "complete",
          draft: { action: "transfer_native_sol", amountSol: "0.1", recipient: RECIPIENT },
          missingFields: [],
          explanation: "x",
        }),
    });
    expect(result.ok && result.response.draft.recipient).toBe(null);
  });
});
