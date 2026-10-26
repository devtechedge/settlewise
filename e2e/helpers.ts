import { expect, type Page } from "@playwright/test";
import { Client } from "pg";
import "dotenv/config";

export async function clearRateLimits() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is required");
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query("delete from rate_limits");
  await client.end();
}

// The URL changes before the redirected page has finished rendering, so a caller that acts on the
// next step would race an in-flight navigation. Waiting for the groups page to be visibly settled
// makes every journey start from the same confirmed state.
export async function expectGroupsLanding(page: Page) {
  await expect(page).toHaveURL(/\/groups/);
  await expect(page.getByRole("link", { name: "New group" })).toBeVisible();
}

export async function signUp(page: Page, name: string, email: string, password: string) {
  await page.goto(process.env.E2E_BASE_URL ? `${process.env.E2E_BASE_URL}/signup` : "/signup");
  await page.fill("#displayName", name);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.check('input[name="acceptTerms"]');
  await page.getByRole("button", { name: "Create account" }).click();
  await expectGroupsLanding(page);
}

export async function getSeededGroupPath(): Promise<string> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is required");
  const client = new Client({ connectionString: url });
  await client.connect();
  const result = await client.query("select id from groups where name = 'Maple House' limit 1");
  await client.end();
  const id = result.rows[0]?.id as string | undefined;
  if (!id) throw new Error("The seeded group is missing from the test database.");
  return `/groups/${id}`;
}

export async function logIn(page: Page, email: string, password: string) {
  await page.goto(process.env.E2E_BASE_URL ? `${process.env.E2E_BASE_URL}/login` : "/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expectGroupsLanding(page);
}
