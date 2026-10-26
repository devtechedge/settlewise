import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { clearRateLimits, getSeededGroupPath, logIn } from "./helpers";

test.describe("demo ledger", () => {
  test.beforeEach(async () => {
    await clearRateLimits();
  });

  test("shows seeded balances, corrections, reversals, and reports", async ({ page }) => {
    await logIn(page, "maya@settlewise.demo", "settlewise-demo-2026");
    await expect(page.getByRole("heading", { name: "Maple House" })).toBeVisible();
    await page.getByRole("link", { name: "Maple House" }).click();

    await expect(page.getByText("\u20b971,110.25").first()).toBeVisible();
    await expect(page.getByText("\u20b925,267.07").first()).toBeVisible();
    await expect(page.getByText("3 suggested transfers")).toBeVisible();
    await expect(page.getByText("Duplicate grocery delivery")).toBeVisible();
    await expect(page.getByText("Payment Reversed", { exact: false }).first()).toBeVisible();

    await page.getByRole("navigation", { name: "Group sections" }).getByRole("link", { name: "Expenses", exact: true }).click();
    await expect(page.getByRole("link", { name: "Team dinner" })).toBeVisible();
    await page.getByRole("link", { name: "Team dinner" }).click();
    await expect(page.getByText("Revision 2", { exact: true })).toBeVisible();
    await page.getByText(/Revision 2 \u00b7 updated/).click();
    await expect(page.getByText("Added the dessert line after checking the receipt.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Team dinner" })).toBeVisible();

    await page.getByRole("navigation", { name: "Group sections" }).getByRole("link", { name: "Settlements", exact: true }).click();
    await expect(page.getByText("Recorded", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Reversal: Recorded from the wrong account", { exact: false }).first()).toBeVisible();

    await page.getByRole("navigation", { name: "Group sections" }).getByRole("link", { name: "Reports", exact: true }).click();
    await expect(page.getByText("Overall monthly budget \u00b7 this month")).toBeVisible();
    await expect(page.getByText("Dining budget \u00b7 this month")).toBeVisible();

    await page.getByRole("navigation", { name: "Group sections" }).getByRole("link", { name: "Audit", exact: true }).click();
    await expect(page.getByRole("cell", { name: "Expense Updated" }).first()).toBeVisible();
    await expect(page.getByRole("cell", { name: "Payment Reversed" }).first()).toBeVisible();
  });

  test("landing, overview, and expense form meet axe without violations", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "accessibility scan runs once");
    await page.goto("/");
    const landing = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
    expect(landing.violations).toEqual([]);

    await logIn(page, "maya@settlewise.demo", "settlewise-demo-2026");
    const overviewAxe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
    expect(overviewAxe.violations).toEqual([]);

    const groupPath = await getSeededGroupPath();
    await page.goto(`${groupPath}/expenses/new`);
    const expenseAxe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
    expect(expenseAxe.violations).toEqual([]);
  });
});
