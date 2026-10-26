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
const data = await page.evaluate(() => ({
  html: { width: document.documentElement.scrollWidth, children: Array.from(document.documentElement.children).map((el) => ({ tag: el.tagName.toLowerCase(), cls: (el.className || "").toString().slice(0,30), sw: (el as HTMLElement).scrollWidth, w: Math.round((el as HTMLElement).getBoundingClientRect().width) })) },
  body: { width: document.body.scrollWidth, children: Array.from(document.body.children).map((el) => ({ tag: el.tagName.toLowerCase(), cls: (el.className || "").toString().slice(0,30), sw: (el as HTMLElement).scrollWidth, w: Math.round((el as HTMLElement).getBoundingClientRect().width) })) },
}));
console.log(JSON.stringify(data, null, 2));
await browser.close();
