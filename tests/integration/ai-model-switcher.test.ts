import { describe, expect, it, vi } from "vitest";
import { getAiConfig, type AiConfig } from "@/server/ai/config";
import { createAiHandlers } from "@/server/ai/handlers";
import { createModelHealth } from "@/server/ai/models";
import { RECIPIENT } from "@/test/fixtures/solana";

const SECRET = "sk-or-v1-test-secret-that-must-never-leak-000000000000";

function config(overrides: Partial<AiConfig> = {}): AiConfig {
  return {
    ...getAiConfig({ OPENROUTER_API_KEY: SECRET, OPENROUTER_MODEL: "a/one", OPENROUTER_MODELS: "b/two,c/three" }),
    baseUrl: "https://ai.example.test/v1",
    ...overrides,
  };
}

const draft = (recipient: string = RECIPIENT) =>
  JSON.stringify({
    status: "complete",
    draft: { action: "transfer_native_sol", amountSol: "0.1", recipient },
    missingFields: [],
    explanation: "Native SOL transfer.",
  });

const completion = (content: string | null) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { "Content-Type": "application/json" } });

function post(path: string, body: unknown): Request {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", host: "localhost:3000" },
    body: JSON.stringify(body),
  });
}

/** Scripted provider: per-model responses, records which model each call used. */
function provider(script: Record<string, Array<Response | Error>>) {
  const calls: Array<{ model: string; body: Record<string, unknown> }> = [];
  const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    const model = String(body.model);
    calls.push({ model, body });
    const next = script[model]?.shift();
    if (!next) throw new Error(`unscripted call for ${model}`);
    if (next instanceof Error) throw next;
    return next;
  });
  return { fetchImpl, calls };
}

const TEXT = `Send 0.1 SOL to ${RECIPIENT}`;

describe("GET /api/ai/models", () => {
  it("lists the allowlist with labels and the default — never the key", async () => {
    const handlers = createAiHandlers({ getConfig: () => config() });
    const response = handlers.models();
    const raw = await response.text();
    expect(raw).not.toContain(SECRET);
    expect(raw).not.toMatch(/OPENROUTER|apiKey|baseUrl/i);
    expect(JSON.parse(raw)).toEqual({
      available: true,
      defaultModel: "a/one",
      models: [
        { id: "a/one", label: "One · A", isDefault: true },
        { id: "b/two", label: "Two · B", isDefault: false },
        { id: "c/three", label: "Three · C", isDefault: false },
      ],
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("reports unavailable with no models when AI is not configured", async () => {
    const handlers = createAiHandlers({ getConfig: () => getAiConfig({ OPENROUTER_MODEL: "a/one" }) });
    expect(await handlers.models().json()).toEqual({ available: false, defaultModel: null, models: [] });
  });
});

describe("POST /api/ai/parse-intent with model selection", () => {
  it("uses the selected allowlisted model and reports it", async () => {
    const { fetchImpl, calls } = provider({ "b/two": [completion(draft())] });
    const handlers = createAiHandlers({ getConfig: () => config(), fetchImpl, health: createModelHealth() });
    const response = await handlers.parseIntent(post("/api/ai/parse-intent", { text: TEXT, model: "b/two" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.meta).toEqual({ model: "b/two", requestedModel: "b/two", fallbackUsed: false });
    expect(calls.map((c) => c.model)).toEqual(["b/two"]);
  });

  it("rejects a model outside the server allowlist before calling the provider", async () => {
    const { fetchImpl } = provider({});
    const handlers = createAiHandlers({ getConfig: () => config(), fetchImpl });
    for (const model of ["openai/gpt-very-expensive", "a/one; DROP", "x".repeat(200)]) {
      const response = await handlers.parseIntent(post("/api/ai/parse-intent", { text: TEXT, model }));
      expect(response.status, model).toBe(400);
      expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("falls back when the selected model is rate limited (HTTP 429), then cools it down", async () => {
    const health = createModelHealth();
    const { fetchImpl, calls } = provider({
      "b/two": [new Response("rate limited", { status: 429 })],
      "a/one": [completion(draft()), completion(draft())],
    });
    const handlers = createAiHandlers({ getConfig: () => config(), fetchImpl, health });
    const first = await handlers.parseIntent(post("/api/ai/parse-intent", { text: TEXT, model: "b/two" }));
    expect(first.status).toBe(200);
    expect((await first.json()).meta).toEqual({ model: "a/one", requestedModel: "b/two", fallbackUsed: true });
    expect(health.isCooling("b/two")).toBe(true);

    // While cooling, the next request for b/two goes straight to a healthy model.
    const second = await handlers.parseIntent(post("/api/ai/parse-intent", { text: TEXT, model: "b/two" }));
    expect((await second.json()).meta).toMatchObject({ model: "a/one", fallbackUsed: true });
    expect(calls.map((c) => c.model)).toEqual(["b/two", "a/one", "a/one"]);
  });

  it("falls back on timeouts and on empty output (reasoning model out of tokens)", async () => {
    const timeoutCase = provider({
      "c/three": [new DOMException("timed out", "TimeoutError")],
      "a/one": [completion(draft())],
    });
    let handlers = createAiHandlers({ getConfig: () => config(), fetchImpl: timeoutCase.fetchImpl, health: createModelHealth() });
    let response = await handlers.parseIntent(post("/api/ai/parse-intent", { text: TEXT, model: "c/three" }));
    expect((await response.json()).meta).toMatchObject({ model: "a/one", fallbackUsed: true });

    const emptyCase = provider({ "c/three": [completion(null)], "a/one": [completion(draft())] });
    handlers = createAiHandlers({ getConfig: () => config(), fetchImpl: emptyCase.fetchImpl, health: createModelHealth() });
    response = await handlers.parseIntent(post("/api/ai/parse-intent", { text: TEXT, model: "c/three" }));
    expect((await response.json()).meta).toMatchObject({ model: "a/one", fallbackUsed: true });
  });

  it("invalid JSON from the selected model: the fallback is the single retry", async () => {
    const { fetchImpl, calls } = provider({ "b/two": [completion("not json at all")], "a/one": [completion(draft())] });
    const handlers = createAiHandlers({ getConfig: () => config(), fetchImpl, health: createModelHealth() });
    const response = await handlers.parseIntent(post("/api/ai/parse-intent", { text: TEXT, model: "b/two" }));
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it("when every attempt fails → 503 and the manual flow; the key never leaks", async () => {
    const { fetchImpl, calls } = provider({
      "b/two": [new Response(`upstream said ${SECRET}`, { status: 500 })],
      "a/one": [new TypeError("connect ECONNREFUSED")],
    });
    const handlers = createAiHandlers({ getConfig: () => config(), fetchImpl, health: createModelHealth() });
    const response = await handlers.parseIntent(post("/api/ai/parse-intent", { text: TEXT, model: "b/two" }));
    expect(response.status).toBe(503);
    const raw = await response.text();
    expect(raw).not.toContain(SECRET);
    expect(raw).not.toContain("ECONNREFUSED");
    expect(calls).toHaveLength(2);
  });

  it("applies the same deterministic guards whichever model answered", async () => {
    const { fetchImpl } = provider({
      "b/two": [new Response("down", { status: 503 })],
      // The fallback model invents a recipient that is not in the user's text.
      "a/one": [completion(draft(RECIPIENT))],
    });
    const handlers = createAiHandlers({ getConfig: () => config(), fetchImpl, health: createModelHealth() });
    const response = await handlers.parseIntent(post("/api/ai/parse-intent", { text: "Send 0.1 SOL to Budi", model: "b/two" }));
    const body = await response.json();
    expect(body.meta.fallbackUsed).toBe(true);
    expect(body.draft.recipient).toBeNull();
    expect(body.status).toBe("needs_input");
  });

  it("charges the daily budget per provider attempt, including fallbacks", async () => {
    const { fetchImpl, calls } = provider({ "b/two": [new Response("down", { status: 503 })], "a/one": [completion(draft())] });
    const handlers = createAiHandlers({ getConfig: () => config({ dailyBudget: 1 }), fetchImpl, health: createModelHealth() });
    const response = await handlers.parseIntent(post("/api/ai/parse-intent", { text: TEXT, model: "b/two" }));
    expect(response.status).toBe(503);
    expect(calls).toHaveLength(1);
  });

  it("sends OpenRouter's reasoning hint only to OpenRouter endpoints", async () => {
    const other = provider({ "a/one": [completion(draft())] });
    await createAiHandlers({ getConfig: () => config(), fetchImpl: other.fetchImpl }).parseIntent(post("/api/ai/parse-intent", { text: TEXT }));
    expect(other.calls[0]?.body.reasoning).toBeUndefined();

    const openrouter = provider({ "a/one": [completion(draft())] });
    await createAiHandlers({
      getConfig: () => config({ baseUrl: "https://openrouter.ai/api/v1" }),
      fetchImpl: openrouter.fetchImpl,
    }).parseIntent(post("/api/ai/parse-intent", { text: TEXT }));
    expect(openrouter.calls[0]?.body.reasoning).toEqual({ effort: "low", exclude: true });
    expect(openrouter.calls[0]?.body.max_tokens).toBeGreaterThanOrEqual(900);
  });
});

describe("POST /api/ai/explain with model selection", () => {
  const summary = {
    status: "blocked",
    reasons: ["AMOUNT_MISMATCH"],
    intendedAmountSol: "0.1",
    actualAmountSol: "0.8",
    recipientMatches: true,
    simulation: "not_run",
    simulationErrorCode: null,
  };

  it("explains with the selected model, falls back, and never sends the model id into the prompt", async () => {
    const { fetchImpl, calls } = provider({
      "c/three": [new Response("busy", { status: 429 })],
      "a/one": [completion(JSON.stringify({ explanation: "The amount differs from your approval, so signing is disabled." }))],
    });
    const handlers = createAiHandlers({ getConfig: () => config(), fetchImpl, health: createModelHealth() });
    const response = await handlers.explain(post("/api/ai/explain", { ...summary, model: "c/three" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.meta).toEqual({ model: "a/one", requestedModel: "c/three", fallbackUsed: true });
    const prompt = JSON.stringify(calls[1]?.body.messages);
    expect(prompt).toContain("AMOUNT_MISMATCH");
    expect(prompt).not.toContain("c/three");
  });

  it("rejects unknown models", async () => {
    const handlers = createAiHandlers({ getConfig: () => config(), fetchImpl: vi.fn() });
    expect((await handlers.explain(post("/api/ai/explain", { ...summary, model: "evil/model" }))).status).toBe(400);
  });
});
