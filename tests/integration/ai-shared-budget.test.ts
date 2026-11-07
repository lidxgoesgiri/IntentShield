import { expect, it, vi } from "vitest";
import { createAiHandlers } from "@/server/ai/handlers";
import { instanceAiProtection } from "@/server/security/request-limit";
import type { AiConfig } from "@/server/ai/config";
import { RECIPIENT } from "@/test/fixtures/solana";

it("parse and explanation factories spend the same per-instance provider-attempt budget", async () => {
  const config: AiConfig = {
    configured: true, apiKey: "not-a-real-key", models: ["test/model"], defaultModel: "test/model",
    baseUrl: "https://ai.example.test/v1", requestsPerMinute: 9, dailyBudget: 1, appUrl: null,
  };
  const protection = instanceAiProtection(config);
  protection.limiter.reset();
  protection.budget.reset();
  const fetchImpl = vi.fn(async () => Response.json({ choices: [{ message: { content: JSON.stringify({
    status: "complete", draft: { action: "transfer_native_sol", amountSol: "0.1", recipient: RECIPIENT }, missingFields: [], explanation: "Draft prepared.",
  }) } }] }));
  const parse = createAiHandlers({ getConfig: () => config, fetchImpl, protection });
  const explain = createAiHandlers({ getConfig: () => config, fetchImpl, protection: instanceAiProtection(config) });
  const post = (body: unknown) => new Request("https://app.example.test/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  expect((await parse.parseIntent(post({ text: `Send 0.1 SOL to ${RECIPIENT}` }))).status).toBe(200);
  expect((await explain.explain(post({ status: "blocked", reasons: ["AMOUNT_MISMATCH"], intendedAmountSol: "0.1", actualAmountSol: "0.8", recipientMatches: true, simulation: "not_run", simulationErrorCode: null }))).status).toBe(503);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  protection.limiter.reset();
  protection.budget.reset();
});
