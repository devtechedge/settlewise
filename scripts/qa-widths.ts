import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
await page.goto("http://localhost:3010/login", { waitUntil: "networkidle" });
await page.fill("#email", "maya@settlewise.demo");
await page.fill("#password", "settlewise-demo-2026");
await page.click('button[type="submit"]');
await page.waitForURL("**/groups");
const groupUrl = await page.locator('a:has-text("Maple House")').getAttribute("href");
const base = `http://localhost:3010${groupUrl}`;
for (const path of ["reports", "participants", "imports"]) {
  await page.goto(`${base}/${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  const result = await page.evaluate(() => {
    const root = document.scrollingElement;
    const selectors = [".page-head", ".page-head > div", ".page-actions", ".import-steps", ".import-step", ".container", ".group-content"];
    const widths = selectors.map((selector) => {
      const el = document.querySelector(selector);
      return el ? { selector, width: Math.round(el.getBoundingClientRect().width), parent: (el.parentElement?.className || "").toString().slice(0, 50) } : null;
    });
    return { scrollWidth: root?.scrollWidth, innerWidth: window.innerWidth, widths };
  });
  console.log(path, JSON.stringify(result, null, 2));
}
await browser.close();
