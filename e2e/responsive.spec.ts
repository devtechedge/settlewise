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
        const metrics = await page.evaluate(() => {
          const vw = window.innerWidth;
          const offenders: { tag: string; cls: string; right: number }[] = [];
          for (const element of document.querySelectorAll("body *")) {
            const rect = element.getBoundingClientRect();
            const overflow = getComputedStyle(element).overflowX;
            if (rect.right > vw + 1 && overflow === "visible") {
              offenders.push({
                tag: element.tagName.toLowerCase(),
                cls: (element.className || "").toString().slice(0, 30),
                right: Math.round(rect.right),
              });
            }
          }
          offenders.sort((a, b) => b.right - a.right);
          return { scrollWidth: document.documentElement.scrollWidth, innerWidth: vw, offenders: offenders.slice(0, 3) };
        });
        const detail = `${path} at ${width}px overflows by ${metrics.scrollWidth - metrics.innerWidth}px; widest: ${JSON.stringify(metrics.offenders)}`;
        expect(metrics.scrollWidth, detail).toBeLessThanOrEqual(metrics.innerWidth + 1);
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
