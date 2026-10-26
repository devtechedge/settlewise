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

export async function selectMapping(page: Page, ariaLabel: string, optionText: string) {
  const value = await page.locator(`select[aria-label="${ariaLabel}"] option`, { hasText: optionText }).first().getAttribute("value");
  if (!value) throw new Error(`No option matching ${optionText} for ${ariaLabel}`);
  await page.evaluate(
    ({ ariaLabel, value }) => {
      const select = document.querySelector(`select[aria-label="${ariaLabel}"]`) as HTMLSelectElement | null;
      if (!select) throw new Error(`Missing select ${ariaLabel}`);
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { ariaLabel, value },
  );
}

export async function signUp(page: Page, name: string, email: string, password: string) {
  await page.goto(process.env.E2E_BASE_URL ? `${process.env.E2E_BASE_URL}/signup` : "/signup");
  await page.fill("#displayName", name);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.check('input[name="acceptTerms"]');
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/groups/);
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
  await expect(page).toHaveURL(/\/groups/);
}
