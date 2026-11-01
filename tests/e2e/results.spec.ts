import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createAdmin, createParent, login, seedChild, serviceClient, totpCode, type Admin } from "./helpers";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

let admin: Admin;
const service = serviceClient();
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

test("admin adds an end-of-topic result with a photo and publishes; parent sees 34 / 50 (68%) and feedback; another parent gets 404", async ({ browser }) => {
  const parentCtx = await browser.newContext();
  const parentPage = await parentCtx.newPage();
  const parent = await createParent(parentPage);
  const childId = await seedChild(parent.id);
  const otherCtx = await browser.newContext();
  const otherPage = await otherCtx.newPage();
  await createParent(otherPage);

  const adminCtx = await browser.newContext();
  const page = await adminCtx.newPage();
  await adminLogin(page);
  await page.goto(`/admin/families/${parent.id}`);
  const section = page.getByRole("region", { name: /Results for / });
  await expect(section).toBeVisible();
  await section.getByRole("button", { name: /Add a result/ }).click();
  await page.getByLabel("Title").fill("Cell biology test");
  await page.getByLabel("Type").selectOption("end_of_topic");
  await page.getByLabel("Date taken").fill("2026-10-20");
  await page.getByLabel("Score", { exact: true }).fill("34");
  await page.getByLabel("Out of").fill("50");
  await page.getByLabel("Grade (optional)").fill("6");
  await page.getByLabel("What went well").fill("Great recall of organelles.\nClear diagrams.");
  await page.getByLabel("What to improve").fill("Show working in calculations.");
  await page.getByLabel("Or choose a file").setInputFiles({ name: "paper.png", mimeType: "image/png", buffer: PNG });
  expect((await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Save result" }).click();
  const item = section.getByRole("listitem").filter({ hasText: "Cell biology test" });
  await expect(item).toBeVisible({ timeout: 15_000 });
  await expect(item.getByText("Draft")).toBeVisible();

  // A draft is invisible to the parent.
  await parentPage.goto(`/account/children/${childId}/results`);
  await expect(parentPage.getByText("Cell biology test")).toHaveCount(0);

  await item.getByRole("button", { name: /^Publish/ }).click();
  await expect(item.getByText("Published", { exact: true })).toBeVisible({ timeout: 15_000 });
  expect((await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()).violations).toEqual([]);

  await parentPage.goto(`/account/children/${childId}/results`);
  await parentPage.getByRole("link", { name: /Cell biology test/ }).click();
  await expect(parentPage.getByText("34 / 50 (68%)")).toBeVisible();
  await expect(parentPage.getByText("End-of-topic test")).toBeVisible();
  await expect(parentPage.getByText("20 October 2026")).toBeVisible();
  await expect(parentPage.getByText("Great recall of organelles.")).toBeVisible();
  await expect(parentPage.getByText("Show working in calculations.")).toBeVisible();
  const href = await parentPage.getByRole("link", { name: /View attachment/ }).getAttribute("href");
  expect((await parentPage.request.get(href!)).status()).toBe(200);
  expect((await new AxeBuilder({ page: parentPage }).withTags(WCAG_TAGS).analyze()).violations).toEqual([]);

  // Another parent gets 404 for both pages.
  const row = await service.from("test_results").select("id").eq("child_id", childId).single();
  const resultId = row.data!.id as string;
  expect((await otherPage.goto(`/account/children/${childId}/results`))?.status()).toBe(404);
  expect((await otherPage.goto(`/account/children/${childId}/results/${resultId}`))?.status()).toBe(404);

  await service.from("test_results").delete().eq("child_id", childId);
  await Promise.all([parentCtx.close(), otherCtx.close(), adminCtx.close()]);
});
