import { expect, test, type Page } from "@playwright/test";

type WorkCounts = { rainPaints: number; ribbonWrites: number };

/** Observe actual rendering work, not the application's internal preference state. */
async function observeDecorativeWork(page: Page) {
  await page.addInitScript(() => {
    const counts = { rainPaints: 0, ribbonWrites: 0 };
    Object.assign(window, { __decorativeWork: counts });
    const clearRect = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.classList.contains("atmospheric-rain")) counts.rainPaints += 1;
      return clearRect.apply(this, args);
    };
    const setAttribute = SVGElement.prototype.setAttribute;
    SVGElement.prototype.setAttribute = function (name, value) {
      if (name === "d" && this.closest(".signature-ribbon")) counts.ribbonWrites += 1;
      return setAttribute.call(this, name, value);
    };
  });
}

async function readWork(page: Page): Promise<WorkCounts> {
  return page.evaluate(() => (window as unknown as { __decorativeWork: WorkCounts }).__decorativeWork);
}

async function sampleStillness(page: Page) {
  return page.evaluate(async () => {
    // Allow the media-query/React effects to settle before the observation window.
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const sample = () => ({
      work: { ...(window as unknown as { __decorativeWork: WorkCounts }).__decorativeWork },
      rail: [...document.querySelectorAll<HTMLElement>("#stack .rail-strip")].map((element) => element.style.transform),
      pulses: [...document.querySelectorAll(".signature-ribbon-pulse, .ribbon-pulse, .core-contour")].map((element) => getComputedStyle(element).strokeDashoffset),
    });
    const before = sample();
    // This is a bounded motion observation window, not a wait for application readiness.
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
    return { before, after: sample() };
  });
}

async function railPositions(page: Page, frames = 0) {
  return page.evaluate(async (count) => {
    for (let frame = 0; frame < count; frame += 1) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return [...document.querySelectorAll<HTMLElement>("#stack .rail-strip")].map((element) => ({
      offset: new DOMMatrix(element.style.transform).m41,
      period: element.querySelector<HTMLElement>(".rail-sequence")!.getBoundingClientRect().width,
    }));
  }, frames);
}

test.describe("runtime motion preference regression", () => {
  test("changing reduced motion without reload stops rain and ribbon rendering, then restores them", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await observeDecorativeWork(page);
    await page.goto("/");
    await expect.poll(async () => (await readWork(page)).rainPaints).toBeGreaterThan(2);
    await expect.poll(async () => (await readWork(page)).ribbonWrites).toBeGreaterThan(2);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator(".signature-ribbon[data-ribbon='signature-hero']")).toHaveAttribute("data-motion-active", "false");
    const stopped = await sampleStillness(page);
    expect(stopped.after.work).toEqual(stopped.before.work);
    expect(stopped.after.pulses).toEqual(stopped.before.pulses);
    await expect(page.locator("#hero h1")).toBeVisible();
    await expect(page.locator("#hero").getByRole("link", { name: "Launch IntentShield" })).toBeVisible();

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect.poll(async () => (await readWork(page)).rainPaints).toBeGreaterThan(stopped.after.work.rainPaints + 1);
    await expect.poll(async () => (await readWork(page)).ribbonWrites).toBeGreaterThan(stopped.after.work.ribbonWrites + 1);

    // The same media change must also stop and restart the two directional rails.
    await page.locator("#stack .rail-row-lower").scrollIntoViewIfNeeded();
    await expect(page.locator("#stack")).toHaveAttribute("data-rail-active", "true");
    await page.emulateMedia({ reducedMotion: "reduce" });
    const reducedRails = await sampleStillness(page);
    expect(reducedRails.after.work).toEqual(reducedRails.before.work);
    expect(reducedRails.after.rail).toEqual(reducedRails.before.rail);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(page.locator("#stack")).toHaveAttribute("data-rail-active", "true");
    const restart = await railPositions(page);
    await expect.poll(async () => (await railPositions(page))[0]!.offset).not.toBe(restart[0]!.offset);
  });
});
