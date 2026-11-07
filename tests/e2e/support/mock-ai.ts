import type { Page } from "@playwright/test";

/** Test-only allowlist served in place of GET /api/ai/models. */
export const MOCK_MODELS = {
  available: true,
  defaultModel: "a/one",
  models: [
    { id: "a/one", label: "One · A", isDefault: true },
    { id: "b/two", label: "Two · B", isDefault: false },
    { id: "c/three", label: "Three · C", isDefault: false },
  ],
};

export async function mockAiModels(page: Page, body: unknown = MOCK_MODELS) {
  await page.route("**/api/ai/models", (route) => route.fulfill({ json: body }));
}
