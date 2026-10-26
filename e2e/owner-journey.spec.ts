import { test, expect } from "@playwright/test";
import { clearRateLimits, signUp } from "./helpers";

test("a new owner can build, correct, settle, import, and export a ledger", async ({ page }) => {
  test.setTimeout(120_000);
  await clearRateLimits();
  const suffix = Date.now();
  const ownerName = "Alpha";
  const email = `alpha.${suffix}@example.test`;
  await signUp(page, ownerName, email, "browser-test-password");

  await page.getByRole("link", { name: "New group" }).click();
  await page.fill("#group-name", `Browser household ${suffix}`);
  await page.selectOption("#group-currency", "INR");
  await page.fill("#group-budget", "5000.00");
  await page.getByRole("button", { name: "Create group" }).click();
  await expect(page.getByText("is ready")).toBeVisible();
  await page.getByRole("link", { name: "Open the group ledger" }).click();
  await expect(page).toHaveURL(/\/groups\/[0-9a-f-]{36}/);
  const groupUrl = new URL(page.url()).pathname;

  await page.getByRole("navigation", { name: "Group sections" }).getByRole("link", { name: "Participants", exact: true }).click();
  await page.fill("#participant-name", "Beta");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("cell", { name: "Beta", exact: true })).toBeVisible();

  await page.getByRole("link", { name: "New expense" }).click();
  await page.fill("#expense-description", "Browser dinner");
  await page.fill("#expense-amount", "100.01");
  await expect(page.getByText("₹50.01").first()).toBeVisible();
  await expect(page.getByText("₹50.00").first()).toBeVisible();
  await page.getByRole("button", { name: "Record expense" }).click();
  await expect(page.getByRole("heading", { name: "Browser dinner" })).toBeVisible();
  await expect(page.getByText("Revision 1", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Correct" }).click();
  await page.fill("#expense-amount", "100.02");
  await page.fill("#expense-reason", "Corrected the total after checking the receipt");
  await page.getByRole("button", { name: "Save correction" }).click();
  await expect(page.getByText("Correction saved as a new revision")).toBeVisible();
  await expect(page.getByText("Revision 2", { exact: true })).toBeVisible();

  await page.getByRole("navigation", { name: "Group sections" }).getByRole("link", { name: "Settlements", exact: true }).click();
  const senderValue = await page.locator("#payment-sender option", { hasText: "Beta · owes" }).first().getAttribute("value");
  const recipientValue = await page.locator("#payment-recipient option", { hasText: `${ownerName} · is owed` }).first().getAttribute("value");
  await page.selectOption("#payment-sender", senderValue ?? "");
  await page.selectOption("#payment-recipient", recipientValue ?? "");
  await page.fill("#payment-amount", "10.00");
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText("Payment of 10.00 INR recorded")).toBeVisible();
  const reverse = page.getByRole("button", { name: /^Reverse payment Beta to/ });
  await reverse.first().click();
  await page.fill('input[id^="reverse-reason-"]', "Test reversal");
  await page.getByRole("button", { name: "Confirm reversal" }).click();
  await expect(page.getByText("Reversal: Test reversal").first()).toBeVisible();

  await page.getByRole("navigation", { name: "Group sections" }).getByRole("link", { name: "Imports", exact: true }).click();
  await page.setInputFiles("#csv-file", "e2e/fixtures/e2e-import.csv");
  await expect(page.getByText("3 rows read")).toBeVisible();
  await page.getByRole("button", { name: "Preview import" }).click();
  await expect(page.getByText("2 valid", { exact: true })).toBeVisible();
  await expect(page.getByText("1 duplicate", { exact: true })).toBeVisible();
  await expect(page.getByText("0 error", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Commit 2 rows and skip duplicates/ }).click();
  await expect(page.getByText("Commit finished: 2 created", { exact: false })).toBeVisible();

  await page.getByRole("navigation", { name: "Group sections" }).getByRole("link", { name: "Expenses", exact: true }).click();
  await expect(page.getByRole("link", { name: "E2E supplies" })).toBeVisible();
  await expect(page.getByRole("link", { name: "E2E shared dinner" })).toHaveCount(1);

  const response = await page.request.get(`${groupUrl.replace("/groups", "/api/groups")}/exports?type=expenses`);
  expect(response.ok()).toBeTruthy();
  const csv = await response.text();
  expect(csv).toContain("Browser dinner");
  expect(csv).toContain("E2E shared dinner");
});
