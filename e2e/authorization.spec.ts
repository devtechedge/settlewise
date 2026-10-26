import { test, expect } from "@playwright/test";
import { clearRateLimits, getSeededGroupPath, logIn, signUp } from "./helpers";
import { Client } from "pg";
import "dotenv/config";
import { writeFile } from "node:fs/promises";

test.beforeEach(async () => {
  await clearRateLimits();
});

test("unauthenticated users are redirected to sign in", async ({ page }) => {
  await page.goto("/groups");
  await expect(page).toHaveURL(/\/login\?next=%2Fgroups/);
});

test("invalid credentials use a generic message", async ({ page }) => {
  await page.goto("/login");
  await page.fill("#email", "maya@settlewise.demo");
  await page.fill("#password", "wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  const rows = await client.query("select key,count,window_start from rate_limits");
  await writeFile("login-rate-debug.txt", JSON.stringify(rows.rows, null, 2));
  await client.end();
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
});

test("duplicate registration is rejected without creating a second account", async ({ page }) => {
  const email = `duplicate.${Date.now()}@example.test`;
  await signUp(page, "First Account", email, "duplicate-test-password");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/?$/);
  await page.goto("/signup");
  await page.fill("#displayName", "Second Account");
  await page.fill("#email", email);
  await page.fill("#password", "duplicate-test-password");
  await page.check('input[name="acceptTerms"]');
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("already registered")).toBeVisible();
});

test("members cannot see another group's ledger", async ({ page, browser }) => {
  await logIn(page, "maya@settlewise.demo", "settlewise-demo-2026");
  const groupPath = await getSeededGroupPath();
  const outsiderContext = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
  const outsider = await outsiderContext.newPage();
  await signUp(outsider, "Outsider Person", `outsider.${Date.now()}@example.test`, "outsider-test-password");
  await outsider.goto(groupPath);
  await expect(outsider.getByRole("heading", { name: "That page is not here" })).toBeVisible();
  await outsiderContext.close();
});
