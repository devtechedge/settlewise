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
const data = await page.evaluate(() => {
  const out: any[] = [];
  const walk = (root: Document | ShadowRoot) => {
    for (const el of Array.from(root.querySelectorAll("*")) as HTMLElement[]) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.right > window.innerWidth + 1 && r.width > 20 && (cs.position === "fixed" || cs.position === "absolute")) {
        out.push({ tag: el.tagName.toLowerCase(), cls: (el.className || "").toString().slice(0, 50), pos: cs.position, left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) });
      }
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  return out;
});
console.log(JSON.stringify(data, null, 2));
await browser.close();
