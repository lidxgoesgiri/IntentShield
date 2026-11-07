import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { mockDevnetRpc } from "./support/mock-rpc";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.describe("accessibility (WCAG 2.2 AA critical flows, LP-17, LP-18)", () => {
  for (const path of ["/", "/app", "/app/demo"]) {
    test(`axe: no serious/critical violations on ${path}`, async ({ page }) => {
      await mockDevnetRpc(page);
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(
        serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) → ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`),
      ).toEqual([]);
    });
  }

  test("skip link moves focus to main content", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });

  test("LP-17: keyboard focus order — header, then hero CTAs, then scenario controls", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    const order: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press("Tab");
      order.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          return `${el?.closest("header") ? "header" : el?.closest("#hero") ? "hero" : el?.closest("#simulator") ? "simulator" : "other"}:${(el?.textContent ?? el?.getAttribute("aria-label") ?? "").trim().slice(0, 40)}`;
        }),
      );
    }
    const firstHero = order.findIndex((entry) => entry.startsWith("hero:Launch IntentShield"));
    const lastHeader = order.map((e) => e.startsWith("header")).lastIndexOf(true);
    expect(lastHeader).toBeGreaterThan(-1);
    expect(firstHero).toBeGreaterThan(lastHeader);
    expect(order[firstHero + 1]).toMatch(/^hero:Explore the Simulator/);
  });

  test("focus indicator is visible on interactive controls", async ({ page }) => {
    await page.goto("/");
    const cta = page.locator("#hero").getByRole("link", { name: /Launch IntentShield/ });
    await cta.focus();
    const outline = await cta.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe("none");
  });

  test("LP-14: reduced motion shows the complete static ribbon and all text", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/");
    await page.locator("#how-it-works").scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    const offsets = await page.locator("[data-ribbon-path]").evaluateAll((paths) => paths.map((p) => getComputedStyle(p).strokeDashoffset));
    for (const offset of offsets) expect(["0", "0px"]).toContain(offset);
    const nodes = await page.locator("[data-ribbon-node]").evaluateAll((els) => els.map((el) => el.getAttribute("data-active")));
    expect(nodes.every((value) => value === "true")).toBe(true);
    await expect(page.getByRole("heading", { name: "Intelligence before approval." })).toBeVisible();
    await context.close();
  });

  test("decorative SVGs are hidden from assistive tech and ignore pointer events", async ({ page }) => {
    await page.goto("/");
    const ribbons = await page.locator("svg[data-ribbon]").evaluateAll((svgs) =>
      svgs.map((svg) => ({ hidden: svg.getAttribute("aria-hidden"), pointer: getComputedStyle(svg).pointerEvents })),
    );
    expect(ribbons.length).toBeGreaterThan(2);
    for (const ribbon of ribbons) {
      expect(ribbon.hidden).toBe("true");
      expect(ribbon.pointer).toBe("none");
    }
  });
});
