import { test, expect } from "@playwright/test";
import { clearRateLimits, getSeededGroupPath, logIn } from "./helpers";

const WIDTHS = [390, 768, 1440];

test("layouts do not scroll horizontally at 390, 768, or 1440", async ({ page }, testInfo) => {
  // Desktop Chromium reports real layout overflow; a mobile-emulated context clamps the document width.
  test.skip(testInfo.project.name !== "chromium", "responsive check runs once, in the desktop project");
  await clearRateLimits();

  async function expectNoOverflow(paths: string[]) {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of paths) {
        await page.goto(path);
        const metrics = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        expect(metrics.scrollWidth, `${path} at ${width}px`).toBeLessThanOrEqual(metrics.innerWidth + 1);
      }
    }
  }

  await expectNoOverflow(["/", "/login", "/privacy", "/terms"]);

  await logIn(page, "maya@settlewise.demo", "settlewise-demo-2026");
  const groupPath = await getSeededGroupPath();
  await expectNoOverflow([
    groupPath,
    `${groupPath}/expenses`,
    `${groupPath}/expenses/new`,
    `${groupPath}/settlements`,
    `${groupPath}/reports`,
    `${groupPath}/participants`,
    `${groupPath}/imports`,
    `${groupPath}/audit`,
  ]);
});
