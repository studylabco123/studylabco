import { expect, test } from "@playwright/test";

test("home returns 200 with lang en-GB", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
});
