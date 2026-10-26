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
  nav: (() => { const el = document.querySelector(".group-nav") as HTMLElement; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return { width: Math.round(r.width), left: Math.round(r.left), right: Math.round(r.right), scrollWidth: el.scrollWidth, overflowX: cs.overflowX, display: cs.display, minWidth: cs.minWidth }; })(),
  wrap: (() => { const el = document.querySelector(".table-wrap") as HTMLElement; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return { width: Math.round(r.width), left: Math.round(r.left), right: Math.round(r.right), scrollWidth: el.scrollWidth, overflowX: cs.overflowX, minWidth: cs.minWidth }; })(),
  inner: (() => { const el = document.querySelector(".group-head-inner") as HTMLElement; const r = el.getBoundingClientRect(); return { width: Math.round(r.width), left: Math.round(r.left), right: Math.round(r.right), scrollWidth: el.scrollWidth }; })(),
  card: (() => { const el = document.querySelector(".card") as HTMLElement; const r = el.getBoundingClientRect(); return { width: Math.round(r.width), left: Math.round(r.left), right: Math.round(r.right), scrollWidth: el.scrollWidth }; })(),
  body: document.body.scrollWidth,
  html: document.documentElement.scrollWidth,
}));
console.log(JSON.stringify(data, null, 2));
await browser.close();
