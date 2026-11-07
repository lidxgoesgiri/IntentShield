import { expect, test } from "@playwright/test";
import { MOCK_MODELS, mockAiModels } from "./support/mock-ai";
import { mockDevnetRpc } from "./support/mock-rpc";
import { installTestWallet, testWalletSignCalls } from "./support/test-wallet";

const RECIPIENT = "FsNiTa4NXvM7mNyiqeGw7FaYgub6g6VHmxzkSo4i5eXL";

test.describe("intent and model-list recovery regressions", () => {
  test("a new partial or unsupported request cannot reuse an earlier recipient or approval", async ({ page }) => {
    // In-page test wallet and intercepted RPC only; this test never requests a signature.
    await installTestWallet(page);
    const rpc = await mockDevnetRpc(page);
    await mockAiModels(page);
    await page.route("**/api/ai/parse-intent", async (route) => {
      const { text } = route.request().postDataJSON() as { text: string };
      const unsupported = text.startsWith("Swap");
      const missingRecipient = text.endsWith("Budi");
      await route.fulfill({ json: {
        status: unsupported ? "unsupported" : missingRecipient ? "needs_input" : "complete",
        draft: {
          action: unsupported ? null : "transfer_native_sol",
          amountSol: unsupported ? null : missingRecipient ? "0.2" : "0.1",
          recipient: unsupported || missingRecipient ? null : RECIPIENT,
        },
        missingFields: missingRecipient ? ["recipient"] : [],
        explanation: unsupported ? "Swaps are not supported." : "Review the transfer details.",
      } });
    });

    await page.goto("/app");
    await page.getByRole("button", { name: /Connect wallet/ }).click();
    await page.getByRole("button", { name: /IntentShield Test Wallet/ }).click();
    const composer = page.getByLabel("Describe the transfer");
    const amount = page.getByLabel("Amount (SOL)");
    const recipient = page.getByLabel("Recipient address (full)");
    const approve = page.getByRole("button", { name: "Approve Intent" });

    await composer.fill(`Send 0.1 SOL to ${RECIPIENT}`);
    await page.getByRole("button", { name: "Analyze Intent" }).click();
    await expect(recipient).toHaveValue(RECIPIENT);
    await expect(approve).toBeEnabled();

    await composer.fill("Send 0.2 SOL to Budi");
    await expect(recipient).toHaveValue("");
    await expect(approve).toBeDisabled();
    await page.getByRole("button", { name: "Analyze Intent" }).click();
    await expect(amount).toHaveValue("0.2");
    await expect(recipient).toHaveValue("");
    await expect(approve).toBeDisabled();

    await composer.fill(`Send 0.1 SOL to ${RECIPIENT}`);
    await page.getByRole("button", { name: "Analyze Intent" }).click();
    await expect(approve).toBeEnabled();
    await composer.fill("Swap 0.1 SOL to USDC");
    await page.getByRole("button", { name: "Analyze Intent" }).click();
    await expect(page.getByText("Only native SOL transfers on Devnet are supported. No transaction was prepared.")).toBeVisible();
    await expect(amount).toHaveValue("");
    await expect(recipient).toHaveValue("");
    await expect(approve).toBeDisabled();
    expect(await testWalletSignCalls(page)).toBe(0);
    expect(rpc.sentTransactions).toHaveLength(0);
    expect(rpc.methods).not.toContain("simulateTransaction");
  });

  test("a failed model-list request can recover with Retry without reloading or losing input", async ({ page }) => {
    await mockDevnetRpc(page);
    let listRequests = 0;
    await page.route("**/api/ai/models", (route) => {
      listRequests += 1;
      return listRequests === 1
        ? route.fulfill({ status: 503, json: { error: { code: "AI_UNAVAILABLE", message: "Unavailable" } } })
        : route.fulfill({ json: MOCK_MODELS });
    });
    await page.goto("/app");
    await expect(page.getByText("Model list unavailable. Drafting can still use the server default; manual entry remains available.")).toBeVisible();
    const composer = page.getByLabel("Describe the transfer");
    await composer.fill(`Send 0.1 SOL to ${RECIPIENT}`);
    await expect(page.getByRole("button", { name: "Analyze Intent" })).toBeEnabled();
    await expect(page.getByRole("combobox", { name: "AI model" })).toBeDisabled();
    await page.getByRole("button", { name: "Retry model list" }).click();
    await expect(page.getByRole("combobox", { name: "AI model" })).toBeEnabled();
    await expect(page.getByRole("combobox", { name: "AI model" })).toContainText("One · A");
    await expect(composer).toHaveValue(`Send 0.1 SOL to ${RECIPIENT}`);
    await expect(page.getByRole("button", { name: "Retry model list" })).toHaveCount(0);
    expect(listRequests).toBe(2);
  });
});
