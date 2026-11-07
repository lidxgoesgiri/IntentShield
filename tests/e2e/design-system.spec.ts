import { mkdirSync, writeFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { getTransferSolInstruction } from "@solana-program/system";
import {
  address, appendTransactionMessageInstruction, compileTransaction, createNoopSigner, createTransactionMessage,
  getBase64EncodedWireTransaction, pipe, setTransactionMessageFeePayer, setTransactionMessageLifetimeUsingBlockhash,
  type Blockhash,
} from "@solana/kit";
import { expect, test, type Page } from "@playwright/test";
import { mockDevnetRpc } from "./support/mock-rpc";

const WIDTHS = [320, 375, 768, 1024, 1440];
const SHOTS = "artifacts/screenshots/after";
const SIG = "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW";
const SENDER = address("Hpge1mfw2jCAj5vGD36Uwk85xLivdG81Zk9MZuJDmp98");
const RECIPIENT = address("FsNiTa4NXvM7mNyiqeGw7FaYgub6g6VHmxzkSo4i5eXL");
const receiptPath = `/tx/${SIG}`;

/** Unsigned fixture only. No wallet exists and this wire transaction is never submitted. */
function receiptWire() {
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (value) => setTransactionMessageFeePayer(SENDER, value),
    (value) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: "4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZAMdL4VZHirAn" as Blockhash, lastValidBlockHeight: 5000n }, value),
    (value) => appendTransactionMessageInstruction(getTransferSolInstruction({ source: createNoopSigner(SENDER), destination: RECIPIENT, amount: 10_000_000n }), value),
  );
  return getBase64EncodedWireTransaction(compileTransaction(message));
}

async function mockReceipt(page: Page) {
  await page.route("https://api.devnet.solana.com/**", async (route) => {
    const body = route.request().postDataJSON() as { id: number; method: string };
    const reply = (result: unknown) => route.fulfill({ json: { jsonrpc: "2.0", id: body.id, result } });
    if (body.method === "getSignatureStatuses") {
      return reply({ context: { slot: 1001 }, value: [{ slot: 1001, confirmations: null, err: null, confirmationStatus: "finalized", status: { Ok: null } }] });
    }
    if (body.method === "getTransaction") {
      return reply({ slot: 1001, blockTime: 1_700_000_000, meta: { err: null, fee: 5001 }, transaction: [receiptWire(), "base64"], version: 0 });
    }
    return route.fallback();
  });
}

async function ready(page: Page, path: string) {
  const rpc = await mockDevnetRpc(page);
  if (path === receiptPath) await mockReceipt(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
  if (path === receiptPath) await expect(page.getByText("Finalized", { exact: true })).toBeVisible();
  else await expect(page.getByRole("button", { name: "Connect wallet", exact: true })).toBeEnabled();
  return rpc;
}

async function expectAccessible(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(result.violations.map((violation) => ({ id: violation.id, impact: violation.impact, targets: violation.nodes.map((node) => node.target) }))).toEqual([]);
}

test.describe("shared product identity and controlled responsive evidence", () => {
  for (const width of WIDTHS) {
    for (const [name, path] of [["workspace", "/app"], ["demo-lab", "/app/demo"], ["receipt", receiptPath]] as const) {
      test(`${name} fits ${width}px and captures explicitly mocked evidence`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        const rpc = await ready(page, path);
        const layout = await page.evaluate(() => ({
          width: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          bodyFont: getComputedStyle(document.body).fontFamily,
          titleFont: getComputedStyle(document.querySelector("main h1")!).fontFamily,
        }));
        expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
        expect(layout.bodyFont.toLowerCase()).toContain("instrument");
        expect(layout.titleFont.toLowerCase()).toContain("basement");
        expect(rpc.sentTransactions).toEqual([]);
        await expect(page.getByRole("link", { name: "IntentShield home", exact: true })).toBeVisible();
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        if (path === receiptPath) {
          await expect(page.getByText("Actual network fee", { exact: true })).toBeVisible();
          await expect(page.getByText("0.000005001 SOL", { exact: true })).toBeVisible();
          await expect(page.getByRole("link", { name: /View on Solana Explorer/ })).toHaveAttribute("href", `https://explorer.solana.com/tx/${SIG}?cluster=devnet`);
        }
        mkdirSync(SHOTS, { recursive: true });
        const filename = `mock-${name}-${width}x900`;
        await page.screenshot({ path: `${SHOTS}/${filename}.png` });
        await page.screenshot({ path: `${SHOTS}/${filename}-full.png`, fullPage: true });
        writeFileSync(`${SHOTS}/${filename}.json`, JSON.stringify({ path, viewport: { width, height: 900 }, provenance: "Controlled E2E wallet-free/RPC-mocked capture. Not an on-chain proof or a new signing test.", ...layout }, null, 2));
        testInfo.annotations.push({ type: "evidence", description: "Controlled RPC mock; no wallet and no funds moved. Screenshots are layout evidence only." });
      });
    }
  }

  test("wallet-disconnected dialog supports keyboard dismissal and has no axe violations", async ({ page }) => {
    await ready(page, "/app");
    await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Connect a Devnet wallet", exact: true })).toBeVisible();
    await expectAccessible(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Connect wallet", exact: true })).toBeFocused();
  });

  test("recipient mismatch result is accessible and cannot offer signing", async ({ page }) => {
    await ready(page, "/app/demo");
    // The radio is visually hidden inside its full-card label. Exercise its
    // native keyboard interaction rather than clicking the clipped input box.
    const recipientScenario = page.getByRole("radio", { name: /Changed recipient/ });
    await recipientScenario.focus();
    await recipientScenario.press("Space");
    await expect(page.getByText("RECIPIENT_MISMATCH", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign with Wallet", exact: true })).toBeDisabled();
    await expectAccessible(page);
  });

  test("finalized mock receipt has accessible status, actual fee and copy interaction", async ({ page }) => {
    await ready(page, receiptPath);
    await expectAccessible(page);
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByRole("button", { name: "Copy transaction signature", exact: true }).click();
    await expect(page.getByRole("button", { name: "transaction signature copied", exact: true })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(SIG);
  });
});
