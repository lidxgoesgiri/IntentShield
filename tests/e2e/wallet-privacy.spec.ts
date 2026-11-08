import { expect, test } from "@playwright/test";
import { mockDevnetRpc } from "./support/mock-rpc";
import { installTestWallet, selectTestWalletAccount, testWalletSignCalls } from "./support/test-wallet";

// Synthetic, valid 64-byte signature (not a real transaction): if the app ever
// read the legacy ownerless key again, this value would be rendered.
const LEGACY_SIGNATURE = "DyXZZCSiBREJ8YZ5cULd7PVdKpbkhHvHJ7otbJmLJajJtRsyq1irMMqKimYeKvRmZ8Sc2qWLhKjYR4ekM8RSzkV";
const RECIPIENT = "FsNiTa4NXvM7mNyiqeGw7FaYgub6g6VHmxzkSo4i5eXL";

test.describe("wallet-scoped privacy and receipt recovery", () => {
  test("a fresh visitor never receives a transaction proof link or a legacy ownerless recovery entry", async ({ page }) => {
    const rpc = await mockDevnetRpc(page);
    await page.addInitScript((signature) => { sessionStorage.setItem("intentshield:last-broadcast-signature", signature); }, LEGACY_SIGNATURE);
    await page.goto("/");
    await expect(page.locator(`a[href*="${LEGACY_SIGNATURE}"]`)).toHaveCount(0);
    await expect(page.locator('a[href^="/tx/"]')).toHaveCount(0);
    await expect(page.getByRole("link", { name: /On-chain proof/ })).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(LEGACY_SIGNATURE);
    await page.goto("/app");
    await expect(page.getByRole("button", { name: "Connect wallet", exact: true })).toBeEnabled();
    await expect(page.getByRole("link", { name: "Recover transaction receipt" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Receipt", exact: true })).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(LEGACY_SIGNATURE);
    expect(rpc.sentTransactions).toEqual([]);
  });

  test("disconnecting the sending wallet hides its receipt details while tracking continues", async ({ page }) => {
    await installTestWallet(page);
    const rpc = await mockDevnetRpc(page, { statuses: ["confirmed"] });
    await page.goto("/app");
    await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
    await page.getByRole("button", { name: /IntentShield Test Wallet/ }).click();
    await expect(page.getByRole("button", { name: /Wallet IntentShield Test Wallet connected/ })).toBeVisible();
    await page.getByLabel("Amount (SOL)").fill("0.1");
    await page.getByLabel("Recipient address (full)").fill(RECIPIENT);
    await page.getByRole("button", { name: "Approve Intent" }).click();
    await expect(page.getByRole("button", { name: "Sign with Wallet" })).toBeEnabled();
    await page.getByRole("button", { name: "Sign with Wallet" }).click();
    await expect(page.getByText("Confirmed on Solana Devnet.").first()).toBeVisible();
    const explorerHref = await page.getByRole("link", { name: /View on Solana Explorer/ }).getAttribute("href");
    const signature = new URL(explorerHref!).pathname.split("/").at(-1)!;

    await selectTestWalletAccount(page, "disconnected");
    await expect(page.getByRole("button", { name: "Connect wallet", exact: true })).toBeVisible();
    const hidden = page.getByRole("region", { name: "Transaction account changed" });
    await expect(hidden).toContainText("Transaction details hidden");
    await expect(hidden).not.toContainText("different wallet");
    await expect(page.getByRole("heading", { name: "Receipt", exact: true })).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(signature);
    await expect(page.locator("body")).not.toContainText(RECIPIENT);
    await expect(page.getByRole("button", { name: "Start a new transfer", exact: true })).toBeVisible();
    expect(await testWalletSignCalls(page)).toBe(1);
    expect(rpc.sentTransactions).toHaveLength(1);
  });

  test("account B and another browser context cannot see account A's tracked transfer; account A can recover it", async ({ page, browser }) => {
    await installTestWallet(page);
    const rpc = await mockDevnetRpc(page, { statuses: ["confirmed"] });
    await page.goto("/app");
    await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
    await page.getByRole("button", { name: /IntentShield Test Wallet/ }).click();
    await expect(page.getByRole("button", { name: /Wallet IntentShield Test Wallet connected/ })).toBeVisible();
    await page.getByLabel("Describe the transfer").fill("Account A's private in-session request");
    await page.getByLabel("Amount (SOL)").fill("0.123456789");
    await page.getByLabel("Recipient address (full)").fill(RECIPIENT);
    await page.getByRole("button", { name: "Approve Intent" }).click();
    await expect(page.getByRole("button", { name: "Sign with Wallet" })).toBeEnabled();
    await page.getByRole("button", { name: "Sign with Wallet" }).click();
    await expect(page.getByText("Confirmed on Solana Devnet.").first()).toBeVisible();
    const explorerHref = await page.getByRole("link", { name: /View on Solana Explorer/ }).getAttribute("href");
    const signature = new URL(explorerHref!).pathname.split("/").at(-1)!;
    const sender = await page.evaluate(() => (window as unknown as { __testWallet: { account: { address: string } } }).__testWallet.account.address);

    await selectTestWalletAccount(page, "other");
    const changedAccount = page.getByRole("region", { name: "Transaction account changed" });
    await expect(changedAccount).toBeVisible();
    await expect(changedAccount).toContainText("Transaction belongs to a different wallet");
    await expect(page.getByRole("heading", { name: "Receipt", exact: true })).toHaveCount(0);
    await expect(page.getByRole("table", { name: /Approved intent compared/ })).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(signature);
    await expect(page.locator("body")).not.toContainText(sender);
    await expect(page.locator("body")).not.toContainText(RECIPIENT);
    await expect(page.getByLabel("Describe the transfer")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Recover transaction receipt" })).toHaveCount(0);

    await selectTestWalletAccount(page, "original");
    await expect(page.getByText("Confirmed on Solana Devnet.").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /View on Solana Explorer/ })).toHaveAttribute("href", explorerHref!);
    await page.getByRole("button", { name: "Start a new transfer", exact: true }).click();
    await expect(page.getByRole("link", { name: "Recover transaction receipt" })).toHaveAttribute("href", `/tx/${signature}`);
    await selectTestWalletAccount(page, "other");
    await expect(page.getByRole("link", { name: "Recover transaction receipt" })).toHaveCount(0);
    await expect(page.getByLabel("Amount (SOL)")).toHaveValue("");
    await expect(page.getByLabel("Recipient address (full)")).toHaveValue("");
    await selectTestWalletAccount(page, "original");
    await expect(page.getByRole("link", { name: "Recover transaction receipt" })).toHaveAttribute("href", `/tx/${signature}`);

    await selectTestWalletAccount(page, "disconnected");
    await expect(page.getByRole("button", { name: "Connect wallet", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Receipt", exact: true })).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(signature);
    await expect(page.getByRole("link", { name: "Recover transaction receipt" })).toHaveCount(0);
    expect(await testWalletSignCalls(page)).toBe(1);
    expect(rpc.sentTransactions).toHaveLength(1);

    const separateContext = await browser.newContext();
    try {
      const visitor = await separateContext.newPage();
      await mockDevnetRpc(visitor);
      await visitor.goto(new URL("/app", page.url()).href);
      await expect(visitor.getByRole("button", { name: "Connect wallet", exact: true })).toBeEnabled();
      await expect(visitor.getByRole("link", { name: "Recover transaction receipt" })).toHaveCount(0);
      await expect(visitor.locator("body")).not.toContainText(signature);
    } finally { await separateContext.close(); }
  });
});
