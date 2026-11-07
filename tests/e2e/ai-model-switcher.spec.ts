import { expect, test, type Page } from "@playwright/test";
import { mockAiModels } from "./support/mock-ai";
import { mockDevnetRpc } from "./support/mock-rpc";
import { installTestWallet } from "./support/test-wallet";

const RECIPIENT = "FsNiTa4NXvM7mNyiqeGw7FaYgub6g6VHmxzkSo4i5eXL";

async function connect(page: Page) {
  await page.getByRole("button", { name: /Connect wallet/ }).click();
  await page.getByRole("button", { name: /IntentShield Test Wallet/ }).click();
  await expect(page.getByRole("button", { name: /Wallet IntentShield Test Wallet connected/ })).toBeVisible();
}

test.describe("AI model switcher (workspace)", () => {
  test("long model names never widen the workspace on small screens", async ({ page }) => {
    // Real label from the production allowlist; the E2E server itself runs keyless.
    const longest = "Nemotron 3 Nano Omni 30B A3B Reasoning · NVIDIA (free)";
    await mockDevnetRpc(page);
    await mockAiModels(page, {
      available: true,
      defaultModel: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
      models: [
        { id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", label: longest, isDefault: true },
        { id: "nvidia/nemotron-3.5-super-vl:free", label: "Nemotron 3.5 Super VL · NVIDIA (free)", isDefault: false },
      ],
    });
    for (const width of [320, 360, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/app");
      await expect(page.getByRole("status", { name: `Active AI model: ${longest}` })).toBeVisible();
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(clientWidth);
    }
  });

  test("without a server key: AI is off and the models endpoint is empty and keyless", async ({ page, request }) => {
    const response = await request.get("/api/ai/models");
    expect(response.status()).toBe(200);
    const raw = await response.text();
    expect(JSON.parse(raw)).toEqual({ available: false, defaultModel: null, models: [] });
    expect(raw).not.toMatch(/sk-or-|OPENROUTER|apiKey/i);

    await mockDevnetRpc(page);
    await page.goto("/app");
    await expect(page.getByRole("status", { name: "AI drafting is off" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "AI model" })).toHaveCount(0);
  });

  test("lists allowlisted models, sends the selection, shows fallback attribution and persists the choice", async ({ page }) => {
    await mockDevnetRpc(page);
    await mockAiModels(page);
    const requested: string[] = [];
    await page.route("**/api/ai/parse-intent", async (route) => {
      const body = route.request().postDataJSON() as { text: string; model?: string };
      requested.push(body.model ?? "(none)");
      await route.fulfill({
        json: {
          status: "complete",
          draft: { action: "transfer_native_sol", amountSol: "0.1", recipient: RECIPIENT },
          missingFields: [],
          explanation: "Native SOL transfer.",
          // The selected model "failed" server-side and the default answered.
          meta: { model: "a/one", requestedModel: body.model ?? "a/one", fallbackUsed: body.model !== "a/one" },
        },
      });
    });

    await page.goto("/app");
    const select = page.getByRole("combobox", { name: "AI model" });
    await expect(select).toHaveValue("a/one");
    await expect(page.getByRole("status", { name: "Active AI model: One · A" })).toBeVisible();
    await expect(page.getByRole("option", { name: "One · A — default" })).toBeAttached();

    await select.selectOption("b/two");
    await expect(page.getByRole("status", { name: "Active AI model: Two · B" })).toBeVisible();

    await page.getByLabel("Describe the transfer").fill(`Send 0.1 SOL to ${RECIPIENT}`);
    await page.getByRole("button", { name: "Analyze Intent" }).click();
    await expect(page.getByText("Answered by One · A — fallback after Two · B failed.")).toBeVisible();
    expect(requested).toEqual(["b/two"]);
    await expect(page.getByLabel("Amount (SOL)")).toHaveValue("0.1");
    await expect(page.getByLabel("Recipient address (full)")).toHaveValue(RECIPIENT);

    await page.reload();
    await expect(page.getByRole("combobox", { name: "AI model" })).toHaveValue("b/two");
  });

  test("switching models never changes verification or the signing gate", async ({ page }) => {
    await installTestWallet(page);
    await mockDevnetRpc(page);
    await mockAiModels(page);
    await page.goto("/app");
    await expect(page.getByRole("combobox", { name: "AI model" })).toHaveValue("a/one");
    await connect(page);

    await page.getByLabel("Amount (SOL)").fill("0.1");
    await page.getByLabel("Recipient address (full)").fill(RECIPIENT);
    await page.getByRole("button", { name: "Approve Intent" }).click();
    await expect(page.getByText(/Intent Matched/)).toBeVisible();
    const sign = page.getByRole("button", { name: "Sign with Wallet" });
    await expect(sign).toBeEnabled();
    const fingerprint = await page.locator("#inspector-heading").locator("xpath=..").locator("[title^='sha256:']").getAttribute("title");

    for (const model of ["b/two", "c/three", "a/one"]) {
      await page.getByRole("combobox", { name: "AI model" }).selectOption(model);
      await expect(page.getByText(/Intent Matched/)).toBeVisible();
      await expect(page.getByRole("table", { name: /Approved intent compared/ }).getByText("Changed")).toHaveCount(0);
      await expect(sign).toBeEnabled();
      expect(await page.locator("#inspector-heading").locator("xpath=..").locator("[title^='sha256:']").getAttribute("title")).toBe(fingerprint);
    }
  });
});
