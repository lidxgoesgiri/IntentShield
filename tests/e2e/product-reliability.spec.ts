import { expect, test } from "@playwright/test";
import { mockAiModels } from "./support/mock-ai";
import { mockDevnetRpc } from "./support/mock-rpc";
import { installTestWallet, selectTestWalletAccount } from "./support/test-wallet";

const RECIPIENT = "FsNiTa4NXvM7mNyiqeGw7FaYgub6g6VHmxzkSo4i5eXL";

test("AI cancellation releases the form and a late response cannot replace manual details", async ({ page }) => {
  const rpc = await mockDevnetRpc(page);
  await mockAiModels(page);
  let started = false;
  let release!: () => void;
  const responseGate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/ai/parse-intent", async route => {
    started = true;
    await responseGate;
    await route.fulfill({ json: { status: "complete", draft: { action: "transfer_native_sol", amountSol: "0.1", recipient: RECIPIENT }, missingFields: [], explanation: "Late draft" } }).catch(() => undefined);
  });
  await page.goto("/app");
  const request = `Send 0.1 SOL to ${RECIPIENT}`;
  await page.getByLabel("Describe the transfer").fill(request);
  await page.getByRole("button", { name: "Analyze Intent" }).click();
  await expect.poll(() => started).toBe(true);
  await page.getByRole("button", { name: "Cancel analysis" }).click();
  await expect(page.getByLabel("Describe the transfer")).toHaveValue(request);
  await page.getByLabel("Amount (SOL)").fill("0.2");
  await page.getByLabel("Recipient address (full)").fill(RECIPIENT);
  release();
  await expect(page.getByRole("button", { name: "Analyze Intent" })).toBeEnabled();
  await expect(page.getByLabel("Amount (SOL)")).toHaveValue("0.2");
  await expect(page.getByText("Late draft", { exact: true })).toHaveCount(0);
  expect(rpc.sentTransactions).toEqual([]);
});

test("manual recipient fragments are not silently joined and offline approval is disabled", async ({ page }) => {
  await installTestWallet(page);
  const rpc = await mockDevnetRpc(page);
  await page.goto("/app");
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await page.getByRole("button", { name: /IntentShield Test Wallet/ }).click();
  await page.getByLabel("Amount (SOL)").fill("0.1");
  const fragment = `${RECIPIENT.slice(0, 10)} ${RECIPIENT.slice(10)}`;
  await page.getByLabel("Recipient address (full)").fill(fragment);
  await expect(page.getByLabel("Recipient address (full)")).toHaveValue(fragment);
  await expect(page.getByRole("button", { name: "Approve Intent" })).toBeDisabled();
  await page.getByLabel("Recipient address (full)").fill(RECIPIENT);
  await expect(page.getByRole("button", { name: "Approve Intent" })).toBeEnabled();
  await page.context().setOffline(true);
  await expect(page.getByRole("button", { name: "Approve Intent" })).toBeDisabled();
  await expect(page.getByText("You are offline. Reconnect before approving a transfer.")).toBeVisible();
  await page.context().setOffline(false);
  await expect(page.getByRole("button", { name: "Approve Intent" })).toBeEnabled();
  expect(rpc.sentTransactions).toEqual([]);
});

test("a failed wallet disconnect stays recoverable without an unhandled rejection", async ({ page }) => {
  await installTestWallet(page, "disconnect-reject");
  await mockDevnetRpc(page);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/app");
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await page.getByRole("button", { name: /IntentShield Test Wallet/ }).click();
  await page.getByRole("button", { name: /Wallet IntentShield Test Wallet connected/ }).click();
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(page.getByText("Your wallet could not confirm disconnection. This site's local session is disconnected; revoke its permission in your wallet if needed.")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Connect a Devnet wallet" })).toBeVisible();
  await page.getByRole("button", { name: /IntentShield Test Wallet/ }).click();
  await expect(page.getByRole("button", { name: /Wallet IntentShield Test Wallet connected/ })).toBeVisible();
  // A later disconnect that the wallet reports itself must not repeat the stale warning.
  await selectTestWalletAccount(page, "disconnected");
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Connect a Devnet wallet" })).toBeVisible();
  await expect(page.getByText("Your wallet could not confirm disconnection.", { exact: false })).toHaveCount(0);
  expect(errors).toEqual([]);
});
