import { expect, test } from "@playwright/test";

test("redirects an unauthenticated visitor to login", async ({ page }) => {
  await page.goto("/posts");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Social Content Manager" })).toBeVisible();
});

test("Kevin can sign in and dry-run the vault scan", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Password").fill("local-kevin-change-me");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/posts/);
  await page.getByRole("link", { name: "Sync", exact: true }).click();
  await page.getByRole("button", { name: "Dry run" }).click();
  await expect(page.getByRole("heading", { name: "Dry-run result" })).toBeVisible();
  await expect(page.getByText(/documents and/)).toBeVisible();
});
