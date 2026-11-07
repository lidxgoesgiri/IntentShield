import { expect, test } from "@playwright/test";

/** Eight numbered chapters plus the unnumbered stack interlude after How It Works. */
const SECTION_ORDER = ["hero", "problem", "simulator", "how-it-works", "stack", "product", "security", "developers", "get-started"];

test.describe("landing structure (LP-01, LP-20, LP-21)", () => {
  test("renders the eight chapters S01–S08 plus the stack interlude in order, with one H1", async ({ page }) => {
    await page.goto("/");
    const ids = await page.locator("main#main > section").evaluateAll((sections) => sections.map((s) => s.id));
    expect(ids).toEqual(SECTION_ORDER);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveText(/Know what\s*you sign\./);
    // Footer exists and is not counted as a section.
    await expect(page.locator("footer")).toBeVisible();
    expect(await page.locator("footer section").count()).toBe(0);
  });

  test("all element ids are unique (SVG gradients must resolve on every layout)", async ({ page }) => {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const duplicates = await page.evaluate(() => {
        const seen = new Map<string, number>();
        document.querySelectorAll("[id]").forEach((el) => seen.set(el.id, (seen.get(el.id) ?? 0) + 1));
        return [...seen].filter(([, count]) => count > 1).map(([id]) => id);
      });
      expect(duplicates, `width ${width}`).toEqual([]);
    }
  });

  test("every section is labelled by its own heading", async ({ page }) => {
    await page.goto("/");
    for (const id of SECTION_ORDER) {
      const labelledBy = await page.locator(`section#${id}`).getAttribute("aria-labelledby");
      expect(labelledBy, id).toBeTruthy();
      await expect(page.locator(`#${labelledBy}`)).toBeAttached();
    }
    const h2 = await page.locator("main h2").allTextContents();
    expect(h2).toEqual(
      expect.arrayContaining([
        "A signature should never be a guessing game.",
        "See the check before the signature.",
        "Intelligence before approval.",
        "Built for the moment before sign.",
        "Trust the checks, not the glow.",
        "Built on inspectable primitives.",
        "Engineered for every signature.",
      ]),
    );
  });

  test("makes no fabricated claims (no audits, scores, partners, 100% safe)", async ({ page }) => {
    await page.goto("/");
    const text = (await page.locator("body").innerText()).toLowerCase();
    for (const banned of ["100% secure", "100% safe", "fully audited", "certified", "security score", "threats blocked", "partnered with", "scam-proof"]) {
      expect(text, banned).not.toContain(banned);
    }
    // Demo provenance is visible where samples appear.
    await expect(page.getByText("Controlled demo · No funds moved").first()).toBeVisible();
    await expect(page.getByText(/Demo \/ sample data/i).first()).toBeVisible();
  });

  test("LP-21: readable without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Trust the checks, not the glow." })).toBeVisible();
    await expect(page.getByRole("link", { name: /Launch IntentShield/ }).first()).toHaveAttribute("href", "/app");
    // LP-12: ribbon remains statically drawn without JS.
    const offset = await page.locator('[data-ribbon="how-desktop"] [data-ribbon-path]').getAttribute("stroke-dashoffset");
    expect(offset).toBe("0");
    await context.close();
  });

  test("health endpoint exposes no secrets", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", service: "intentshield", cluster: "devnet" });
    expect(response.headers()["cache-control"]).toContain("no-store");
  });

  test("security headers are set", async ({ request }) => {
    const response = await request.get("/");
    const headers = response.headers();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["content-security-policy"]).toContain("https://api.devnet.solana.com");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-powered-by"]).toBeUndefined();
  });
});
