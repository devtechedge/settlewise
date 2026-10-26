import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
await page.goto("http://localhost:3010/login", { waitUntil: "networkidle" });
await page.fill("#email", "maya@settlewise.demo");
await page.fill("#password", "settlewise-demo-2026");
await page.click('button[type="submit"]');
await page.waitForURL("**/groups");
const href = await page.locator('a:has-text("Maple House")').getAttribute("href");
await page.goto(`http://localhost:3010${href}/participants`, { waitUntil: "networkidle" });
const offenders = await page.evaluate(() => {
  const out: { selector: string; width: number; parent: string }[] = [];
  for (const el of document.querySelectorAll("body *")) {
    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth + 1 && rect.width > 40) {
      out.push({
        selector: `${el.tagName.toLowerCase()}.${(el.className || "").toString().split(/\s+/).slice(0, 2).join(".")}`,
        width: Math.round(rect.width),
        parent: (el.parentElement?.className || "").toString().slice(0, 40),
      });
      if (out.length > 12) break;
    }
  }
  return out;
});
console.log(JSON.stringify(offenders, null, 2));
await browser.close();
