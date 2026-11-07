import { expect, test } from "@playwright/test";

test.describe("landing simulator in a real browser (LP-05…LP-07, LP-11)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#simulator");
  });

  test("exact match → success, with DEMO provenance and no wallet involvement", async ({ page }) => {
    const sim = page.locator("[data-simulator]");
    await expect(sim.locator("[data-demo-status]")).toHaveAttribute("data-demo-status", "idle");
    await sim.getByRole("button", { name: "Run Check" }).click();
    await expect(sim.locator("[data-demo-status]")).toHaveAttribute("data-demo-status", "success");
    await expect(sim.getByText("Demo: supported transaction fields match the sample intent.").first()).toBeVisible();
    await expect(sim.getByText("Controlled demo · No funds moved")).toBeVisible();
    await expect(sim.getByRole("button", { name: /sign/i })).toHaveCount(0);
  });

  test("changed amount → warning with 0.1 → 0.8 SOL diff", async ({ page }) => {
    const sim = page.locator("[data-simulator]");
    await sim.getByRole("radio", { name: /Changed Amount/ }).check();
    await sim.getByRole("button", { name: "Run Check" }).click();
    await expect(sim.locator("[data-demo-status]")).toHaveAttribute("data-demo-status", "warning");
    await expect(sim.getByText("AMOUNT_MISMATCH")).toBeVisible();
    await expect(sim.getByText(/0\.8 SOL \(800,000,000 lamports\)/).first()).toBeVisible();
  });

  test("changed recipient → warning with highlighted characters", async ({ page }) => {
    const sim = page.locator("[data-simulator]");
    await sim.getByRole("radio", { name: /Changed Recipient/ }).check();
    await sim.getByRole("button", { name: "Run Check" }).click();
    await expect(sim.locator("[data-demo-status]")).toHaveAttribute("data-demo-status", "warning");
    await expect(sim.getByText("RECIPIENT_MISMATCH")).toBeVisible();
    expect(await sim.locator("mark").count()).toBeGreaterThan(0);
  });

  test("keyboard only: select a scenario and run the check", async ({ page }) => {
    const sim = page.locator("[data-simulator]");
    await sim.getByRole("radio", { name: /Exact Match/ }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(sim.getByRole("radio", { name: /Changed Amount/ })).toBeChecked();
    await sim.getByRole("button", { name: "Run Check" }).focus();
    await page.keyboard.press("Enter");
    await expect(sim.locator("[data-demo-status]")).toHaveAttribute("data-demo-status", "warning");
  });

  test("LP-11: the landing never contacts the Solana RPC or opens a wallet", async ({ page }) => {
    const rpcCalls: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("solana.com")) rpcCalls.push(request.url());
    });
    await page.goto("/");
    const sim = page.locator("[data-simulator]");
    for (const name of [/Exact Match/, /Changed Amount/, /Changed Recipient/]) {
      await sim.getByRole("radio", { name }).check();
      await sim.getByRole("button", { name: "Run Check" }).click();
      await expect(sim.locator("[data-demo-status]")).not.toHaveAttribute("data-demo-status", "loading");
    }
    expect(rpcCalls).toEqual([]);
  });
});
