import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const base = process.env.QA_BASE_URL ?? "http://localhost:3000";
const out = "docs/screenshots";
await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const consoleErrors: string[] = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(`console: ${msg.text()}`);
});
page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));

async function shot(name: string, fullPage = true) {
  await page.screenshot({ path: `${out}/${name}.png`, fullPage });
}

async function overflowAudit(label: string, widths: number[] = [390, 768, 1440]) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(250);
    const result = await page.evaluate(() => {
      const root = document.scrollingElement;
      if (!root) return { scrollWidth: 0, innerWidth: 0, offenders: [] as { tag: string; cls: string; width: number }[] };
      const offenders: { tag: string; cls: string; width: number }[] = [];
      if (root.scrollWidth > window.innerWidth + 1) {
        for (const element of document.querySelectorAll("body *")) {
          const rect = element.getBoundingClientRect();
          if (rect.right > window.innerWidth + 1 && rect.width > 40) {
            offenders.push({ tag: element.tagName.toLowerCase(), cls: (element.className || "").toString().slice(0, 80), width: Math.round(rect.width) });
            if (offenders.length >= 8) break;
          }
        }
      }
      return { scrollWidth: root.scrollWidth, innerWidth: window.innerWidth, offenders };
    });
    console.log(`OVERFLOW ${label} @${width}: ${result.scrollWidth}/${result.innerWidth}`, result.offenders);
  }
  await page.setViewportSize({ width: 1440, height: 1050 });
}

await page.goto(base, { waitUntil: "networkidle" });
await shot("01-landing");
await overflowAudit("landing");

await page.goto(`${base}/login`, { waitUntil: "networkidle" });
await page.fill("#email", "maya@settlewise.demo");
await page.fill("#password", "settlewise-demo-2026");
await page.click('button[type="submit"]');
await page.waitForURL("**/groups");
await page.waitForLoadState("networkidle");
await shot("02-groups");
await overflowAudit("groups");

await page.click('a:has-text("Maple House")');
await page.waitForURL("**/groups/*");
await page.waitForLoadState("networkidle");
const overviewUrl = page.url();
await shot("03-group-overview");
await overflowAudit("group overview");

async function visit(path: string, name: string) {
  await page.goto(`${overviewUrl.replace(/\/$/, "")}/${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await shot(name);
  await overflowAudit(name.replace(/^\d+-/, ""));
}

await visit("expenses", "04-expenses");
await visit("expenses/new", "05-new-expense");
await visit("settlements", "06-settlements");
await visit("reports", "07-reports");
await visit("audit", "08-audit");
await visit("participants", "09-participants");
await visit("imports", "10-imports");

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(base, { waitUntil: "networkidle" });
await shot("11-landing-mobile");
await page.goto(`${base}/login`, { waitUntil: "networkidle" });
await shot("12-login-mobile");
await page.goto(overviewUrl, { waitUntil: "networkidle" });
await shot("13-overview-mobile");
await page.goto(`${overviewUrl.replace(/\/$/, "")}/expenses/new`, { waitUntil: "networkidle" });
await shot("14-expense-form-mobile");

console.log("CONSOLE ERRORS:", consoleErrors);
await browser.close();
