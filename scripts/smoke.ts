import { chromium } from "@playwright/test";

const base = process.env.SMOKE_BASE_URL ?? "https://settlewise-psi.vercel.app";
const suffix = Date.now();
const ownerName = `Smoke Owner ${suffix}`;
const ownerEmail = `smoke.owner.${suffix}@example.test`;
const outsiderEmail = `smoke.outsider.${suffix}@example.test`;
const password = "smoke-test-password";
const groupName = `Smoke household ${suffix}`;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: base, viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

await page.goto("/signup");
await page.fill("#displayName", ownerName);
await page.fill("#email", ownerEmail);
await page.fill("#password", password);
await page.check('input[name="acceptTerms"]');
await page.getByRole("button", { name: "Create account" }).click();
await page.waitForURL("**/groups");
console.log("signup ok");

await page.getByRole("link", { name: "New group" }).click();
await page.fill("#group-name", groupName);
await page.fill("#group-budget", "2000.00");
await page.getByRole("button", { name: "Create group" }).click();
await page.getByText("is ready").waitFor();
await page.getByRole("link", { name: "Open the group ledger" }).click();
await page.waitForURL(/\/groups\/[0-9a-f-]{36}/);
const groupPath = new URL(page.url()).pathname;
console.log("group created", groupPath);

await page.getByRole("navigation", { name: "Group sections" }).getByRole("link", { name: "Participants", exact: true }).click();
await page.fill("#participant-name", `Smoke Partner ${suffix}`);
await page.getByRole("button", { name: "Add" }).click();
await page.getByRole("cell", { name: `Smoke Partner ${suffix}`, exact: true }).waitFor();

await page.getByRole("link", { name: "New expense" }).click();
await page.fill("#expense-description", "Smoke dinner");
await page.fill("#expense-amount", "100.01");
await page.getByRole("button", { name: "Record expense" }).click();
await page.getByRole("heading", { name: "Smoke dinner" }).waitFor();
const expensePath = new URL(page.url()).pathname;
const detail = await page.request.get(expensePath);
assert(detail.ok(), "expense detail request failed");
console.log("expense created", expensePath);

await page.getByRole("link", { name: "Correct" }).click();
await page.fill("#expense-amount", "100.02");
await page.fill("#expense-reason", "Smoke correction");
await page.getByRole("button", { name: "Save correction" }).click();
await page.getByText("Correction saved as a new revision").waitFor();

await page.getByRole("navigation", { name: "Group sections" }).getByRole("link", { name: "Settlements", exact: true }).click();
const sender = await page.locator("#payment-sender option", { hasText: `Smoke Partner ${suffix}` }).first().getAttribute("value");
const recipient = await page.locator("#payment-recipient option", { hasText: ownerName }).first().getAttribute("value");
assert(sender && recipient, "payment participants missing");
await page.selectOption("#payment-sender", sender);
await page.selectOption("#payment-recipient", recipient);
await page.fill("#payment-amount", "10.00");
await page.getByRole("button", { name: "Record payment" }).click();
await page.getByText("Payment of 10.00 INR recorded").waitFor();
await page.getByRole("button", { name: /^Reverse payment/ }).first().click();
await page.fill('input[id^="reverse-reason-"]', "Smoke reversal");
await page.getByRole("button", { name: "Confirm reversal" }).click();
await page.getByText("Reversal: Smoke reversal").first().waitFor();
console.log("payment and reversal ok");

const balances = await page.request.get(`/api/groups/${groupPath.split("/").pop()}/balances`);
assert(balances.ok(), "balances request failed");
const balanceBody = await balances.json();
const balanceSum = balanceBody.balances.reduce((acc: bigint, row: { netMinor: string }) => acc + BigInt(row.netMinor), 0n);
assert(balanceSum === 0n, "production balances do not sum to zero");
console.log("balance invariant ok", balanceBody.balances.length, "participants");

const outsiderContext = await browser.newContext({ baseURL: base });
const outsider = await outsiderContext.newPage();
await outsider.goto("/signup");
await outsider.fill("#displayName", `Smoke Outsider ${suffix}`);
await outsider.fill("#email", outsiderEmail);
await outsider.fill("#password", password);
await outsider.check('input[name="acceptTerms"]');
await outsider.getByRole("button", { name: "Create account" }).click();
await outsider.waitForURL("**/groups");
await outsider.goto(groupPath);
await outsider.getByRole("heading", { name: "That page is not here" }).waitFor();
console.log("cross-group isolation ok");
await outsiderContext.close();

const health = await page.request.get("/api/health");
assert(health.ok(), "health check failed");
console.log("health ok");

const groupId = groupPath.split("/").pop();
assert(groupId, "group id missing from the ledger URL");
const groupApiPath = `/api/groups/${groupId}`;

async function deleteGroupRequest(confirmation: string) {
  return page.evaluate(
    async ({ path, name }) => {
      const response = await fetch(path, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation: name }),
      });
      const body = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
      return { status: response.status, code: body?.error?.code ?? "ok", message: body?.error?.message ?? "" };
    },
    { path: groupApiPath, name: confirmation },
  );
}

const mismatched = await deleteGroupRequest("Not the group name");
assert(mismatched.status === 400 && mismatched.code === "VALIDATION_ERROR", "group deletion accepted a wrong confirmation");
const stillThere = await page.request.get(groupApiPath);
assert(stillThere.ok(), "group vanished after a rejected confirmation");
console.log("deletion confirmation guard ok");

const deleted = await deleteGroupRequest(groupName);
assert(deleted.status === 200, `group deletion failed (${deleted.status}): ${deleted.message}`);
const gone = await page.request.get(groupApiPath);
assert(gone.status() === 404, `deleted group still resolves with ${gone.status()}`);
await page.goto(groupPath);
await page.getByRole("heading", { name: "That page is not here" }).waitFor();
console.log("group cleanup ok");

await context.close();
await browser.close();
console.log("production smoke passed");
