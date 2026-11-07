import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { mockDevnetRpc } from "./support/mock-rpc";

const WIDTHS = [320, 360, 390, 430, 768, 1024, 1280, 1440, 1920];
const SHOTS = "artifacts/screenshots";

async function horizontalOverflow(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    // An element clipped by a scroll/overflow container that itself fits the
    // viewport does not overflow the page (e.g. a horizontally scrollable code block).
    const clippedByFittingAncestor = (el: Element) => {
      for (let parent = el.parentElement; parent; parent = parent.parentElement) {
        const overflowX = getComputedStyle(parent).overflowX;
        if (overflowX !== "visible" && parent.getBoundingClientRect().right <= width + 1) return true;
      }
      return false;
    };
    const offenders = [...document.querySelectorAll("body *")]
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return (
          rect.width > 0 &&
          rect.right > width + 1 &&
          style.position !== "fixed" &&
          !el.closest("[hidden]") &&
          !clippedByFittingAncestor(el)
        );
      })
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className?.toString?.() ?? "").slice(0, 50)}`);
    return { scrollWidth: document.documentElement.scrollWidth, width, offenders };
  });
}

test.describe("responsive layout (LP-15, LP-16, §18 matrix)", () => {
  for (const width of WIDTHS) {
    for (const path of ["/", "/app", "/app/demo"]) {
      test(`no horizontal overflow at ${width}px on ${path}`, async ({ page }) => {
        await mockDevnetRpc(page);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const result = await horizontalOverflow(page);
        expect(result.offenders, JSON.stringify(result)).toEqual([]);
        expect(result.scrollWidth).toBeLessThanOrEqual(result.width);
      });
    }
  }

  test("primary CTA stays tappable (≥44px) on small phones", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto("/");
    const cta = page.locator("#hero").getByRole("link", { name: /Launch IntentShield/ });
    await expect(cta).toBeVisible();
    const box = await cta.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeLessThanOrEqual(320);
    // The hero clips decorative layers; the headline text itself must never be cut off.
    const rights = await page.locator("#hero-title span").evaluateAll((spans) =>
      spans.map((span) => {
        const range = document.createRange();
        range.selectNodeContents(span);
        return range.getBoundingClientRect().right;
      }),
    );
    for (const right of rights) expect(right).toBeLessThanOrEqual(320);
  });

  test("hero trust facts stay on one line from tablet up, flush with the column", async ({ page }) => {
    // From 1024 px the hero column is only ~23–30rem wide; the compact row must still fit.
    for (const width of [768, 1024, 1100, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const layout = await page.locator("#hero .hero-trust").evaluate((list) => {
        const column = list.parentElement!.getBoundingClientRect();
        const items = Array.from(list.querySelectorAll("button")).map((button) => button.getBoundingClientRect());
        const lineStarts = new Map<number, number>();
        for (const box of items) {
          const top = Math.round(box.top);
          if (!lineStarts.has(top)) lineStarts.set(top, box.left - column.left);
        }
        return {
          lines: lineStarts.size,
          starts: Array.from(lineStarts.values()),
          maxRight: Math.max(...items.map((box) => box.right - column.right)),
        };
      });
      expect(layout.lines, `${width}px lines`).toBe(1);
      for (const start of layout.starts) expect(Math.abs(start), `${width}px line start`).toBeLessThanOrEqual(1);
      expect(layout.maxRight, `${width}px right edge`).toBeLessThanOrEqual(1);
    }
  });

  test("captures evidence screenshots (desktop/tablet/mobile/reduced motion/warning)", async ({ browser }) => {
    mkdirSync(SHOTS, { recursive: true });
    const sizes = [
      { name: "desktop-1440x900", width: 1440, height: 900 },
      { name: "tablet-768x1024", width: 768, height: 1024 },
      { name: "mobile-390x844", width: 390, height: 844 },
      { name: "mobile-320x700", width: 320, height: 700 },
    ];
    for (const size of sizes) {
      const context = await browser.newContext({ viewport: { width: size.width, height: size.height } });
      const page = await context.newPage();
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await page.screenshot({ path: `${SHOTS}/landing-${size.name}.png` });
      await page.screenshot({ path: `${SHOTS}/landing-${size.name}-full.png`, fullPage: true });
      await context.close();
    }
    const reduced = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const page = await reduced.newPage();
    await page.goto("/#how-it-works");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/landing-reduced-motion-how-it-works.png` });
    await page.goto("/#simulator");
    const sim = page.locator("[data-simulator]");
    await sim.getByRole("radio", { name: /Changed Recipient/ }).check();
    await sim.getByRole("button", { name: "Run Check" }).click();
    await expect(sim.locator("[data-demo-status]")).toHaveAttribute("data-demo-status", "warning");
    await sim.screenshot({ path: `${SHOTS}/simulator-warning-state.png` });
    await reduced.close();
  });
});
