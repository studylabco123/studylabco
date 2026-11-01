import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createAdmin, createParent, login, serviceClient, totpCode, type Admin } from "./helpers";

/**
 * Admin teaching-hours and term-date editors. These change shared rows
 * (availability_rules, term_periods), so Playwright runs this file in the
 * serial "config" project, and every test puts the seed rows back.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const service = serviceClient();

let admin: Admin;
test.beforeAll(async () => {
  admin = await createAdmin();
});

async function adminLogin(page: Page) {
  await login(page, admin.email, admin.password);
  await expect(page).toHaveURL(/\/admin\/mfa$/, { timeout: 20_000 });
  await page.getByLabel("6-digit code").fill(totpCode(admin.totpSecret));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible({ timeout: 20_000 });
}

test.describe("teaching hours", () => {
  test("admin adds a holiday Wednesday window and sees it in the table; axe clean", async ({ page }) => {
    // The seeded holiday Wednesday window (07:00-22:00) overlaps the one added below, so set it aside and always put it back.
    const seeded = await service.from("availability_rules").select("*").eq("period", "holiday").eq("weekday", 3);
    if (seeded.error) throw seeded.error;
    try {
      const del = await service.from("availability_rules").delete().eq("period", "holiday").eq("weekday", 3);
      if (del.error) throw del.error;

      await adminLogin(page);
      await page.goto("/admin/settings");
      await page.getByRole("link", { name: "Teaching hours" }).click();
      await expect(page.getByRole("heading", { name: "Teaching hours", level: 1 })).toBeVisible();

      await page.getByLabel("When in the year").selectOption("holiday");
      await page.getByLabel("Day of the week").selectOption("3");
      await page.getByLabel("From").selectOption("07:00");
      await page.getByLabel("Until").selectOption("09:00");
      await page.getByRole("button", { name: "Add time window" }).click();

      const holidays = page.getByRole("region", { name: "School holidays" });
      await expect(holidays.getByText("Wed 07:00–09:00 · Assessment, 1-to-1 · Your place")).toBeVisible();
      expect((await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()).violations).toEqual([]);
    } finally {
      const clean = await service.from("availability_rules").delete().eq("period", "holiday").eq("weekday", 3);
      if (clean.error) throw clean.error;
      if (seeded.data.length) {
        const ins = await service.from("availability_rules").insert(seeded.data);
        if (ins.error) throw ins.error;
      }
    }
  });

  test("overlapping window shows the refusal", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/settings/hours");
    await page.getByLabel("When in the year").selectOption("term");
    await page.getByLabel("Day of the week").selectOption("1");
    await page.getByLabel("From").selectOption("18:00");
    await page.getByLabel("Until").selectOption("19:00");
    await page.getByRole("button", { name: "Add time window" }).click();
    await expect(page.locator("p[role=alert]")).toHaveText("That overlaps another time window on the same day.");
  });

  test("parent cannot open the hours or terms pages", async ({ page }) => {
    await createParent(page);
    for (const path of ["/admin/settings/hours", "/admin/settings/terms"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/account/);
    }
  });
});

test.describe("term dates", () => {
  const label = `E2E ${randomUUID().slice(0, 6)}`;
  test.afterEach(async () => {
    const del = await service.from("term_periods").delete().like("label", "E2E %");
    if (del.error) throw del.error;
  });

  test("admin adds a term period and it is listed; axe clean", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/settings/terms");
    await expect(page.getByText("Any date not inside a term period uses holiday hours.")).toBeVisible();
    await page.getByLabel("Name").fill(label);
    await page.getByLabel("First day").fill("2028-01-10");
    await page.getByLabel("Last day").fill("2028-01-20");
    await page.getByRole("button", { name: "Add term period" }).click();
    await expect(page.getByText(`${label}: Mon, 10 Jan 2028 to Thu, 20 Jan 2028`)).toBeVisible();

    await page.getByLabel("First day").fill("2028-01-15");
    await page.getByLabel("Last day").fill("2028-01-25");
    await page.getByLabel("Name").fill("E2E overlap");
    await page.getByRole("button", { name: "Add term period" }).click();
    await expect(page.locator("p[role=alert]")).toHaveText("Those dates overlap another term period.");
    expect((await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()).violations).toEqual([]);
  });
});
