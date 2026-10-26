import { chromium } from "@playwright/test";

const base = process.env.QA_BASE_URL ?? "http://localhost:3100";
const routes = ["/", "/login", "/signup", "/groups", "/account", "/settings"];

function kb(bytes: number) {
  return (bytes / 1024).toFixed(1).padStart(7);
}

const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: base, viewport: { width: 1280, height: 900 } });

// The ledger pages need a session; the demo endpoint is the only way to get one without a form flow.
const loginResponse = await fetch(`${base}/api/auth/demo`, { method: "POST", headers: { origin: base } });
const setCookie = loginResponse.headers.get("set-cookie");
if (!loginResponse.ok || !setCookie) {
  console.error(`Demo login failed with ${loginResponse.status}; run the seeded demo first.`);
  process.exit(1);
}
const cookie = setCookie.split(";")[0] ?? "";
const separator = cookie.indexOf("=");
if (separator < 1) {
  console.error("The demo login response did not include a usable session cookie.");
  process.exit(1);
}
const name = cookie.slice(0, separator);
const value = cookie.slice(separator + 1);
await context.addCookies([{ name, value, url: base }]);

let groupPath = "/groups";
{
  const probe = await context.newPage();
  await probe.goto(`${base}/groups`);
  const href = await probe.locator('a[href^="/groups/"]').first().getAttribute("href");
  if (href) groupPath = href;
  await probe.close();
}

const targets = [...routes, `${groupPath}/expenses`, `${groupPath}/settlements`, `${groupPath}/imports`, `${groupPath}/reports`];
const totals: Record<string, number> = {};

type Bucket = "script" | "stylesheet" | "font" | "image" | "document" | "other";
const bucketOrder: Bucket[] = ["script", "stylesheet", "font", "image", "document", "other"];

console.log(`First-load bytes per page against ${base}`);
console.log("route".padEnd(46) + "   js  style   font  image   doc   total");
for (const route of targets) {
  const page = await context.newPage();
  const bytes: Record<Bucket, number> = { script: 0, stylesheet: 0, font: 0, image: 0, document: 0, other: 0 };
  page.on("response", async (response) => {
    const type = response.request().resourceType();
    const header = Number(response.headers()["content-length"] ?? "0");
    const size = header > 0 ? header : (await response.body().catch(() => new Uint8Array())).length;
    const key: Bucket = bucketOrder.find((bucket) => bucket === type) ?? "other";
    bytes[key] += size;
  });
  await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
  const total = bucketOrder.reduce((acc, bucket) => acc + bytes[bucket], 0);
  totals[route] = total;
  console.log(route.padEnd(46) + bucketOrder.map((bucket) => kb(bytes[bucket])).join(" ") + " " + kb(total));
  await page.close();
}

const largest = Object.entries(totals).sort((a, b) => b[1] - a[1])[0] ?? ["/", 0];
console.log(`Largest page: ${largest[0]} at ${kb(largest[1])} kB transferred.`);
await browser.close();
