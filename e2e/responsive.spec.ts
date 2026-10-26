import { test, expect } from "@playwright/test";
import { clearRateLimits, getSeededGroupPath, logIn } from "./helpers";

test("mobile layouts do not scroll horizontally", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "responsive check runs in the mobile project");
  await clearRateLimits();
  for (const path of ["/", "/login", "/privacy", "/terms"]) {
    await page.goto(path);
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(metrics.scrollWidth, path).toBeLessThanOrEqual(metrics.innerWidth + 1);
  }

  await logIn(page, "maya@settlewise.demo", "settlewise-demo-2026");
  const groupPath = await getSeededGroupPath();
  for (const path of [groupPath, `${groupPath}/expenses`, `${groupPath}/settlements`, `${groupPath}/reports`, `${groupPath}/participants`, `${groupPath}/audit`]) {
    await page.goto(path);
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(metrics.scrollWidth, path).toBeLessThanOrEqual(metrics.innerWidth + 1);
  }
});
