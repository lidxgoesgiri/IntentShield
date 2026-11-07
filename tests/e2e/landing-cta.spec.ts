import { expect, test } from "@playwright/test";

test.describe("landing CTAs and navigation (LP-02…LP-04, PRD §31)", () => {
  test("LP-02: hero primary CTA opens the app", async ({ page }) => {
    await page.goto("/");
    await page.locator("#hero").getByRole("link", { name: /Launch IntentShield/ }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("heading", { level: 1, name: "Know what you sign." })).toBeVisible();
  });

  test("LP-03: hero secondary CTA moves to the simulator", async ({ page }) => {
    await page.goto("/");
    await page.locator("#hero").getByRole("link", { name: /Explore the Simulator/ }).click();
    await expect(page).toHaveURL(/#simulator$/);
    await expect(page.locator("#simulator")).toBeInViewport();
  });

  test("LP-04: every link resolves to a real route, existing anchor, or configured external URL", async ({ page, request }) => {
    await page.goto("/");
    const hrefs = await page.locator("a[href]").evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""));
    expect(hrefs.length).toBeGreaterThan(10);
    for (const href of hrefs) {
      expect(href, "no dead '#' links").not.toBe("#");
      expect(href).not.toBe("");
      if (href.startsWith("#") || href.startsWith("/#")) {
        const id = href.split("#")[1]!;
        await expect(page.locator(`[id="${id}"]`), href).toHaveCount(1);
      } else if (href.startsWith("/")) {
        const response = await request.get(href);
        expect(response.status(), href).toBeLessThan(400);
      } else {
        expect(href, "external links must be https and configured").toMatch(/^https:\/\/(github\.com\/lidxgoesgiri\/IntentShield)/);
      }
    }
  });

  test("header anchors target real sections", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary" });
    for (const [label, id] of [
      ["How It Works", "how-it-works"],
      ["Security", "security"],
      ["Developers", "developers"],
    ] as const) {
      await nav.getByRole("link", { name: label }).click();
      await expect(page).toHaveURL(new RegExp(`#${id}$`));
      await expect(page.locator(`#${id}`)).toBeInViewport();
    }
    await expect(nav.getByRole("link", { name: /GitHub/ })).toHaveAttribute("href", "https://github.com/lidxgoesgiri/IntentShield");
  });

  test("final CTA distinguishes real app vs demo", async ({ page }) => {
    await page.goto("/");
    const final = page.locator("#get-started");
    await expect(final.getByRole("link", { name: /Launch IntentShield/ })).toHaveAttribute("href", "/app");
    await expect(final.getByRole("link", { name: /Run Demo/ })).toHaveAttribute("href", "#simulator");
    await expect(final).toContainText("does not guarantee recipient safety");
  });

  test("mobile menu is keyboard operable and closes with Escape", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const toggle = page.getByRole("button", { name: "Open menu" });
    await toggle.click();
    await expect(page.getByRole("navigation", { name: "Mobile" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("navigation", { name: "Mobile" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
  });
});
