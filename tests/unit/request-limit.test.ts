import { describe, expect, it } from "vitest";
import { getAiConfig } from "@/server/ai/config";
import { extractJsonObject } from "@/server/ai/client";
import { clientKey, createDailyBudget, createRateLimiter } from "@/server/security/request-limit";

describe("AI abuse protection", () => {
  it("sliding window allows `limit` requests per window, then reports Retry-After", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000, now: () => now });
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(true);
    const blocked = limiter.check("a");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
    expect(limiter.check("b").allowed).toBe(true);
    now = 60_001;
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("daily budget resets on a new UTC day", () => {
    let now = 0;
    const budget = createDailyBudget({ budget: 1, now: () => now });
    expect(budget.consume()).toBe(true);
    expect(budget.consume()).toBe(false);
    now = 86_400_000;
    expect(budget.consume()).toBe(true);
  });

  it("hashes client IPs instead of keeping them", () => {
    const key = clientKey(new Request("http://x", { headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" } }));
    expect(key).toMatch(/^[0-9a-f]{32}$/);
    expect(key).not.toContain("203.0.113.9");
  });
});

describe("AI config & output parsing", () => {
  it("is not configured without both key and model", () => {
    expect(getAiConfig({}).configured).toBe(false);
    expect(getAiConfig({ OPENROUTER_API_KEY: "k" }).configured).toBe(false);
    expect(getAiConfig({ OPENROUTER_API_KEY: "k", OPENROUTER_MODEL: "m" }).configured).toBe(true);
    expect(getAiConfig({ OPENROUTER_API_KEY: "k", OPENROUTER_MODEL: "m", AI_BASE_URL: "not a url" }).configured).toBe(false);
  });

  it("extracts JSON from fenced or chatty model output", () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJsonObject('Sure! {"a":2} hope this helps')).toEqual({ a: 2 });
    expect(() => extractJsonObject("no json here")).toThrow();
  });
});
