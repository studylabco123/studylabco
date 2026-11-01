import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import { randomUUID } from "node:crypto";
import { londonDateOf } from "../../src/lib/time";
import { createAdmin, login, serviceClient, totpCode, type Admin } from "./helpers";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
// A 1x1 PNG.
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

test("the tax pack route turns a signed-out visitor away", async ({ request }) => {
  const res = await request.get("/api/admin/tax-pack?year=2026-27&format=xlsx", { maxRedirects: 0 });
  expect(res.status()).toBeGreaterThanOrEqual(300);
  expect(res.status()).toBeLessThan(400);
  expect(res.headers()["content-type"] ?? "").not.toContain("spreadsheet");
});

test("expense with a private receipt, miles entry and the tax pack downloads", async ({ page }) => {
  const tag = randomUUID().slice(0, 8);
  const today = londonDateOf(new Date());
  const tripNote = `Trip ${tag}`;
  const trip = await service.from("mileage").insert({ trip_on: today, miles: null, note: tripNote }).select("id").single();
  expect(trip.error).toBeNull();

  await adminLogin(page);
  await page.goto("/admin/money");
  await expect(page.getByRole("heading", { name: "Money" })).toBeVisible();
  await expect(page.getByText("This week")).toBeVisible();
  await expect(page.getByLabel("Take a photo of the receipt")).toHaveAttribute("capture", "environment");

  // Expense with a receipt.
  await page.getByLabel("Amount (pounds)").fill("21.50");
  await page.getByLabel("Category").selectOption("stationery");
  await page.getByLabel("Description (optional)").fill(`Pens ${tag}`);
  await page.getByLabel("Or choose a receipt file").setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Add expense" }).click();
  const row = page.getByRole("row").filter({ hasText: `Pens ${tag}` });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText("£21.50");
  await expect(row.getByRole("link", { name: "View receipt" })).toBeVisible();

  const saved = await service.from("expenses").select("receipt_path, amount_pence").eq("description", `Pens ${tag}`).single();
  expect(saved.data?.amount_pence).toBe(2150);
  const path = saved.data!.receipt_path as string;
  expect(path).toMatch(/^receipts\/\d{4}\/[0-9a-f-]{36}\.png$/);
  // The signed link works; a public link does not.
  const href = await row.getByRole("link", { name: "View receipt" }).getAttribute("href");
  expect((await page.request.get(href!)).status()).toBe(200);
  const pub = await fetch(service.storage.from("receipts").getPublicUrl(path).data.publicUrl);
  expect(pub.status).not.toBe(200);

  // A wrong file type is refused with a message, before any upload.
  await page.getByLabel("Amount (pounds)").fill("5");
  await page.getByLabel("Category").selectOption("other");
  await page.getByLabel("Or choose a receipt file").setInputFiles({ name: "bad.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
  await page.getByRole("button", { name: "Add expense" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "photo or a PDF" })).toBeVisible();
  await page.reload();

  // Mileage.
  const tripRow = page.getByRole("row").filter({ hasText: tripNote });
  await tripRow.getByRole("textbox").fill("12");
  await tripRow.getByRole("button", { name: /Save miles/ }).click();
  await expect.poll(async () => Number((await service.from("mileage").select("miles").eq("id", trip.data!.id).single()).data?.miles)).toBe(12);

  // Tax page and downloads.
  await page.goto("/admin/money/tax");
  await expect(page.getByRole("heading", { name: "Tax Year Pack" })).toBeVisible();
  await expect(page.getByText("Record-keeping aid, not tax advice.")).toBeVisible();
  const xlsx = await page.request.get(`/api/admin/tax-pack?year=${(await page.locator("h2").first().textContent())!.slice(0, 7)}&format=xlsx`);
  expect(xlsx.status()).toBe(200);
  expect(xlsx.headers()["content-disposition"]).toMatch(/^attachment; filename="studylabco-tax-pack-\d{4}-\d{2}\.xlsx"$/);
  expect(xlsx.headers()["cache-control"]).toBe("no-store");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await xlsx.body()) as never);
  expect(wb.worksheets.map((w) => w.name)).toEqual([
    "1. Summary", "2. Income", "3. Monthly", "4. Expenses", "5. Mileage", "6. Refunds, credits & waivers", "7. Unpaid at year end",
  ]);
  const pdf = await page.request.get(`/api/admin/tax-pack?year=${(await page.locator("h2").first().textContent())!.slice(0, 7)}&q=1&format=pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-disposition"]).toMatch(/-Q1\.pdf"$/);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  expect((await page.request.get("/api/admin/tax-pack?year=bogus&format=pdf")).status()).toBe(400);

  await service.from("expenses").delete().eq("description", `Pens ${tag}`);
  await service.storage.from("receipts").remove([path]);
  await service.from("mileage").delete().eq("id", trip.data!.id);
});

test("money and tax pages have no accessibility violations", async ({ page }) => {
  await adminLogin(page);
  for (const path of ["/admin/money", "/admin/money/tax"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations, path).toEqual([]);
  }
});
