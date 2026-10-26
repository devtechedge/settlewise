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
const result = await page.evaluate(() => {
  const offenders: { path: string; width: number; overflow: string[] }[] = [];
  function scrollable(el: HTMLElement | null) {
    const out: string[] = [];
    let current = el;
    while (current && current !== document.body) {
      const style = getComputedStyle(current);
      if (/(auto|scroll|hidden)/.test(style.overflowX)) out.push(`${current.tagName.toLowerCase()}.${(current.className || "").toString().split(/\s+/)[0]}:${style.overflowX}`);
      current = current.parentElement;
    }
    return out;
  }
  for (const element of Array.from(document.querySelectorAll("body *")) as HTMLElement[]) {
    const rect = element.getBoundingClientRect();
    if (rect.right > window.innerWidth + 1 && rect.width > 40) {
      const containers = scrollable(element);
      if (containers.length === 0) {
        const path: string[] = [];
        let current: HTMLElement | null = element;
        while (current && path.length < 5) {
          path.push(`${current.tagName.toLowerCase()}.${(current.className || "").toString().split(/\s+/)[0]}`);
          current = current.parentElement;
        }
        offenders.push({ path: path.join(" < "), width: Math.round(rect.width), overflow: containers });
        if (offenders.length > 10) break;
      }
    }
  }
  return { scrollWidth: document.scrollingElement?.scrollWidth, innerWidth: window.innerWidth, offenders };
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
