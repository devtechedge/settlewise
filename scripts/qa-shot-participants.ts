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
await page.screenshot({ path: "docs/screenshots/participants-mobile-debug.png", fullPage: true });
const info = await page.evaluate(() => {
  const candidates = Array.from(document.querySelectorAll("body *")) as HTMLElement[];
  return candidates
    .map((el) => ({
      selector: `${el.tagName.toLowerCase()}.${(el.className || "").toString().split(/\s+/).slice(0,2).join(".")}`,
      width: Math.round(el.getBoundingClientRect().width),
      left: Math.round(el.getBoundingClientRect().left),
      right: Math.round(el.getBoundingClientRect().right),
      parent: (el.parentElement?.className || "").toString().split(/\s+/)[0],
    }))
    .filter((row) => row.right > window.innerWidth + 1 && row.width > 40)
    .slice(0, 20);
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
