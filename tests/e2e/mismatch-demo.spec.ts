import { expect, test } from "@playwright/test";
import { installTestWallet, testWalletSignCalls } from "./support/test-wallet";
import { mockDevnetRpc } from "./support/mock-rpc";

test.describe("Demo Lab (E2E #6, #7 · FR-010)", () => {
  test("altered amount and recipient are blocked; signing is disabled with no wallet prompt", async ({ page }) => {
    await installTestWallet(page);
    const rpc = await mockDevnetRpc(page);
    await page.goto("/app/demo");
    await expect(page.getByText("Controlled demo · No funds moved")).toBeVisible();

    const cases = [
      { radio: /Changed amount/, reason: "AMOUNT_MISMATCH" },
      { radio: /Changed recipient/, reason: "RECIPIENT_MISMATCH" },
      { radio: /Extra instruction/, reason: "UNEXPECTED_ADDITIONAL_INSTRUCTION" },
      { radio: /Mutated after review/, reason: "MESSAGE_CHANGED" },
    ];
    for (const item of cases) {
      await page.getByRole("radio", { name: item.radio }).check({ force: true });
      await expect(page.getByRole("alert").filter({ hasText: "Verification Failed — signing disabled" })).toBeVisible();
      await expect(page.getByText(item.reason).first()).toBeVisible();
      const sign = page.getByRole("button", { name: /Sign with Wallet/ });
      await expect(sign).toBeDisabled();
    }

    await page.getByRole("radio", { name: /Exact match/ }).check({ force: true });
    await expect(page.getByText("Intent Matched")).toBeVisible();
    await expect(page.getByRole("button", { name: /Sign with Wallet/ })).toBeDisabled();

    expect(await testWalletSignCalls(page)).toBe(0);
    expect(rpc.sentTransactions).toEqual([]);
  });

  test("the lab invites a real transfer only through an explicit link", async ({ page }) => {
    await page.goto("/app/demo");
    await page.getByRole("link", { name: /Try a real Devnet transfer/ }).click();
    await expect(page).toHaveURL(/\/app$/);
  });
});
