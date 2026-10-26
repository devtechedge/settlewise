import { chromium, type Response as BrowserResponse } from "@playwright/test";

const base = process.env.QA_BASE_URL ?? "http://localhost:3100";

function kb(bytes: number) {
  return (bytes / 1024).toFixed(1).padStart(7);
}

type Bucket = "script" | "stylesheet" | "font" | "image" | "document" | "other";
const bucketOrder: Bucket[] = ["script", "stylesheet", "font", "image", "document", "other"];

const browser = await chromium.launch();

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
const sessionCookie = { name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: base };

const probeContext = await browser.newContext({ baseURL: base, viewport: { width: 1280, height: 900 } });
await probeContext.addCookies([sessionCookie]);
const probe = await probeContext.newPage();
await probe.goto(`${base}/groups`);
const groupPath = (await probe.locator('article.card h2 a[href^="/groups/"]').first().getAttribute("href")) ?? "/groups";
await probeContext.close();

// Each page is measured in a fresh context so the numbers describe a first visit, not a warm cache.
async function measure(route: string, signedIn: boolean) {
  const context = await browser.newContext({ baseURL: base, viewport: { width: 1280, height: 900 } });
  if (signedIn) await context.addCookies([sessionCookie]);
  const page = await context.newPage();
  const responses: BrowserResponse[] = [];
  page.on("response", (response) => responses.push(response));
  await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
  const bytes: Record<Bucket, number> = { script: 0, stylesheet: 0, font: 0, image: 0, document: 0, other: 0 };
  for (const response of responses) {
    const sizes = await response.request().sizes().catch(() => null);
    const size = sizes?.responseBodySize ?? 0;
    const key = bucketOrder.find((bucket) => bucket === response.request().resourceType()) ?? "other";
    bytes[key] += size;
  }
  await context.close();
  return bucketOrder.reduce((acc, bucket) => acc + bytes[bucket], 0) > 0 ? bytes : null;
}

const targets: [string, boolean][] = [
  ["/", false],
  ["/login", false],
  ["/signup", false],
  ["/groups", true],
  ["/account", true],
  ["/settings", true],
  [`${groupPath}/expenses`, true],
  [`${groupPath}/settlements`, true],
  [`${groupPath}/imports`, true],
  [`${groupPath}/reports`, true],
];

console.log(`First visit, on-the-wire bytes per page against ${base}`);
console.log("route".padEnd(50) + "   js  style   font  image   doc   total");
const totals: Record<string, number> = {};
for (const [route, signedIn] of targets) {
  const bytes = await measure(route, signedIn);
  if (!bytes) {
    console.log(route.padEnd(50) + "  (no responses recorded)");
    continue;
  }
  const total = bucketOrder.reduce((acc, bucket) => acc + bytes[bucket], 0);
  totals[route] = total;
  console.log(route.padEnd(50) + bucketOrder.map((bucket) => kb(bytes[bucket])).join(" ") + " " + kb(total));
}

const largest = Object.entries(totals).sort((a, b) => b[1] - a[1])[0] ?? ["/", 0];
console.log(`Largest first visit: ${largest[0]} at ${kb(largest[1])} kB.`);
await browser.close();
