import { expect, test, type Page } from "@playwright/test";
import { MAINNET_GENESIS, mockDevnetRpc, type MockRpcOptions } from "./support/mock-rpc";
import { mockAiModels } from "./support/mock-ai";
import { installTestWallet, testWalletSignCalls, type TestWalletMode } from "./support/test-wallet";

const RECIPIENT = "FsNiTa4NXvM7mNyiqeGw7FaYgub6g6VHmxzkSo4i5eXL";

async function openApp(page: Page, wallet: TestWalletMode | null = "approve", rpc: MockRpcOptions = {}) {
  if (wallet) await installTestWallet(page, wallet);
  const log = await mockDevnetRpc(page, rpc);
  await page.goto("/app");
  await expect(page.getByRole("button", { name: /Connect wallet/ })).toBeEnabled();
  return log;
}

async function connect(page: Page) {
  await page.getByRole("button", { name: /Connect wallet/ }).click();
  await page.getByRole("button", { name: /IntentShield Test Wallet/ }).click();
  await expect(page.getByRole("button", { name: /Wallet IntentShield Test Wallet connected/ })).toBeVisible();
}

async function fillDraft(page: Page, amount = "0.1", recipient = RECIPIENT) {
  await page.getByLabel("Amount (SOL)").fill(amount);
  await page.getByLabel("Recipient address (full)").fill(recipient);
}

async function approveAndVerify(page: Page) {
  await page.getByRole("button", { name: "Approve Intent" }).click();
  // Case-sensitive: the alert title, not the "Intent matched and simulation…" status line.
  await expect(page.getByText(/Intent Matched/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign with Wallet" })).toBeEnabled();
}

test.describe("real workflow with a test wallet + mocked Devnet RPC (PRD §19.3)", () => {
  test("E2E #2: without a wallet, approval and signing are impossible", async ({ page }) => {
    await openApp(page, null);
    await fillDraft(page);
    await expect(page.getByRole("button", { name: "Approve Intent" })).toBeDisabled();
    await expect(page.getByText("Connect a Devnet wallet to continue.").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Sign with Wallet/ })).toHaveCount(0);
  });

  test("E2E #3: invalid amount and missing/invalid address show visible errors", async ({ page }) => {
    await openApp(page);
    await connect(page);
    await page.getByLabel("Amount (SOL)").fill("1e-9");
    await page.getByLabel("Recipient address (full)").fill("Budi");
    await expect(page.getByText(/Use a plain decimal number/)).toBeVisible();
    await expect(page.getByText(/not a valid Solana address/)).toBeVisible();
    await page.getByLabel("Amount (SOL)").fill("0.0000000001");
    await expect(page.getByText(/at most 9 decimal places/)).toBeVisible();
    await page.getByLabel("Amount (SOL)").fill("2");
    await expect(page.getByText(/limited to 1 SOL/)).toBeVisible();
    await page.getByLabel("Recipient address (full)").fill("");
    await expect(page.getByText(/Paste the recipient's full Solana address/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve Intent" })).toBeDisabled();
  });

  test("E2E #4: manual transfer success path — verify, simulate, sign once, submit, confirm", async ({ page }) => {
    const rpc = await openApp(page);
    await connect(page);
    await fillDraft(page);
    await approveAndVerify(page);

    // The inspector is computed from the decoded message, row by row.
    const table = page.getByRole("table", { name: /Approved intent compared/ });
    await expect(table.getByRole("rowheader")).toHaveCount(8);
    await expect(table.getByText("Changed")).toHaveCount(0);
    await expect(page.getByText("Simulation passed on Solana Devnet")).toBeVisible();

    const sign = page.getByRole("button", { name: "Sign with Wallet" });
    await expect(sign).toBeEnabled();
    // UT-19 in the browser: a double click produces one wallet request and one broadcast.
    await sign.dblclick();

    await expect(page.getByText("Confirmed on Solana Devnet.").first()).toBeVisible({ timeout: 20_000 });
    const receipt = page.getByRole("region", { name: "Receipt" }).or(page.locator("section", { has: page.getByRole("heading", { name: "Receipt" }) }));
    await expect(receipt.getByText("Confirmed", { exact: true })).toBeVisible();
    const explorer = page.getByRole("link", { name: /View on Solana Explorer/ });
    await expect(explorer).toHaveAttribute("href", /^https:\/\/explorer\.solana\.com\/tx\/[1-9A-HJ-NP-Za-km-z]{64,88}\?cluster=devnet$/);

    expect(await testWalletSignCalls(page)).toBe(1);
    expect(rpc.sentTransactions).toHaveLength(1);
    expect(rpc.methods).toContain("simulateTransaction");
    // Submitted ≠ confirmed: status polling happened before the receipt said "Confirmed".
    expect(rpc.methods.filter((m) => m === "getSignatureStatuses").length).toBeGreaterThanOrEqual(2);
  });

  test("E2E #5: AI unavailable → manual entry still completes verification", async ({ page }) => {
    await openApp(page);
    await connect(page);
    // This E2E server has no AI key: the workspace says so up front instead of failing later.
    await expect(page.getByRole("status", { name: "AI drafting is off" })).toBeVisible();
    await page.getByLabel("Describe the transfer").fill(`Send 0.1 SOL to ${RECIPIENT}`);
    await expect(page.getByRole("button", { name: "Analyze Intent" })).toBeDisabled();
    await expect(page.getByText("AI drafting is not configured on this deployment. Enter the details manually.")).toBeVisible();
    await fillDraft(page);
    await approveAndVerify(page);
    await expect(page.getByRole("button", { name: "Sign with Wallet" })).toBeEnabled();
  });

  test("E2E #5b: AI provider failing → offline copy, manual entry still works", async ({ page }) => {
    await mockAiModels(page);
    await page.route("**/api/ai/parse-intent", (route) =>
      route.fulfill({ status: 503, json: { error: { code: "AI_UNAVAILABLE", message: "AI assistance is unavailable. You can still transfer manually." } } }),
    );
    await openApp(page);
    await connect(page);
    await page.getByLabel("Describe the transfer").fill(`Send 0.1 SOL to ${RECIPIENT}`);
    await page.getByRole("button", { name: "Analyze Intent" }).click();
    await expect(page.getByText("AI help is offline. Enter the transfer details manually.").first()).toBeVisible();
    await fillDraft(page);
    await approveAndVerify(page);
  });

  test("AI draft is untrusted: invented recipients are discarded, real ones need review", async ({ page }) => {
    await mockAiModels(page);
    await openApp(page);
    await page.route("**/api/ai/parse-intent", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          status: "complete",
          draft: { action: "transfer_native_sol", amountSol: "0.2", recipient: RECIPIENT },
          missingFields: [],
          explanation: "I identified a native SOL transfer.",
        }),
      }),
    );
    await connect(page);
    await page.getByLabel("Describe the transfer").fill("Send 0.2 SOL to Budi");
    await page.getByRole("button", { name: "Analyze Intent" }).click();
    await expect(page.getByText(/Paste the recipient's full Solana address/).first()).toBeVisible();
    await expect(page.getByLabel("Recipient address (full)")).toHaveValue("");
    await expect(page.getByLabel("Amount (SOL)")).toHaveValue("0.2");
    await expect(page.getByText("Filled by AI — review")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve Intent" })).toBeDisabled();
  });

  test("E2E #8a: wallet rejection is recoverable and nothing is broadcast", async ({ page }) => {
    const rpc = await openApp(page, "reject");
    await connect(page);
    await fillDraft(page);
    await approveAndVerify(page);
    await page.getByRole("button", { name: "Sign with Wallet" }).click();
    await expect(page.getByText("Not signed — nothing was sent")).toBeVisible();
    expect(rpc.sentTransactions).toEqual([]);
    await page.getByRole("button", { name: "Review again" }).click();
    await expect(page.getByRole("button", { name: "Approve Intent" })).toBeEnabled();
  });

  test("E2E #8b: RPC unavailable during simulation → Unable to Verify, no signing", async ({ page }) => {
    const rpc = await openApp(page, "approve", { simulationUnavailable: true });
    await connect(page);
    await fillDraft(page);
    await page.getByRole("button", { name: "Approve Intent" }).click();
    await expect(page.getByText("Simulation unavailable — signing disabled")).toBeVisible();
    await expect(page.getByRole("button", { name: /Sign with Wallet/ })).toHaveCount(0);
    expect(await testWalletSignCalls(page)).toBe(0);
    expect(rpc.sentTransactions).toEqual([]);
    await expect(page.getByRole("button", { name: "Review again" })).toBeVisible();
  });

  test("a wallet that alters the message is blocked at the sign boundary — nothing is broadcast", async ({ page }) => {
    const rpc = await openApp(page, "mutate");
    await connect(page);
    await fillDraft(page);
    await approveAndVerify(page);
    await page.getByRole("button", { name: "Sign with Wallet" }).click();
    const blocked = page.getByRole("alert").filter({ hasText: "Signing blocked at the wallet boundary — nothing was sent" });
    await expect(blocked).toBeVisible();
    await expect(blocked).toContainText(/modified the transaction before signing/);
    await expect(blocked).toContainText("MESSAGE_CHANGED");
    expect(rpc.sentTransactions).toEqual([]);
  });

  test("insufficient balance fails preflight before simulation", async ({ page }) => {
    const rpc = await openApp(page, "approve", { balance: 50_000_000 });
    await connect(page);
    await fillDraft(page);
    await page.getByRole("button", { name: "Approve Intent" }).click();
    await expect(page.getByText("Simulation failed — signing disabled")).toBeVisible();
    await expect(page.getByText(/Insufficient balance/)).toBeVisible();
    expect(rpc.methods).not.toContain("simulateTransaction");
  });

  test("a non-Devnet RPC (mainnet genesis) disables approval entirely", async ({ page }) => {
    await openApp(page, "approve", { genesisHash: MAINNET_GENESIS });
    await connect(page);
    await fillDraft(page);
    await expect(page.getByText("Network not verified as Solana Devnet")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve Intent" })).toBeDisabled();
  });

  test("FR-004: editing one digit after verification discards the approval", async ({ page }) => {
    await openApp(page);
    await connect(page);
    await fillDraft(page);
    await approveAndVerify(page);
    await page.getByLabel("Amount (SOL)").fill("0.11");
    await expect(page.getByText(/previous approval and checks were discarded/)).toBeVisible();
    await expect(page.getByText(/Intent Matched/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Approve Intent" })).toBeEnabled();
  });

  test("receipt page reads status from RPC; malformed signatures 404", async ({ page }) => {
    await mockDevnetRpc(page, { statuses: ["confirmed"] });
    const signature = "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW";
    await page.goto(`/tx/${signature}`);
    await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();
    const response = await page.goto("/tx/not-a-signature");
    expect(response?.status()).toBe(404);
  });
});
