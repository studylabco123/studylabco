/**
 * The whole parent/admin journey from spec §8.4, at both viewports (it runs in
 * the "iphone" and "windows" projects; it changes no shared settings):
 *
 * parent signs up → adds a child → signs the agreement → books an Assessment
 * Lesson at the tutor's place → admin (TOTP) marks it attended (and paid) and
 * approves the child → parent books a Saturday 6-week block (£102) → the
 * dashboard shows the 6 sessions and the block's reference → parent
 * late-cancels week 1 (fee dialog) → admin marks the block paid → admin
 * downloads the Tax Year Pack, whose Income sheet holds the £102 payment.
 *
 * Time travel, done with the service client because the server's clock can't
 * be moved:
 * - The assessment is moved into the past ("the lesson takes place") so the
 *   admin can mark it attended (only started lessons can be).
 * - Before the late cancellation the block's created_at is set 20 days back
 *   and week 1 is moved to start in about a day ("the parent comes back near
 *   the first lesson"). A cancellation within 14 days of booking is free
 *   (cooling-off, Ruling R20), so without the backdating the dialog would
 *   rightly offer a free cancellation and the fee path would go untested.
 */
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import ExcelJS from "exceljs";
import { randomInt, randomUUID } from "node:crypto";
import {
  createAdmin,
  createParent,
  deleteBookingsFor,
  login,
  serviceClient,
  setBankDetails,
  totpCode,
  type Admin,
  type Parent,
} from "./helpers";

const COOLING_OFF = /I want lessons to start within 14 days/;
const HOUR = 3600_000;
const DAY = 24 * HOUR;

let parent: Parent | undefined;

test.beforeAll(setBankDetails);
test.afterEach(async () => {
  if (!parent) return;
  const service = serviceClient();
  await service.from("ledger").delete().eq("parent_id", parent.id);
  await deleteBookingsFor(parent.id);
  await service.auth.admin.deleteUser(parent.id);
  parent = undefined;
});

/** A second browser context for the admin, at the same viewport as the project. */
async function adminPage(browser: Browser, info: TestInfo, baseURL: string | undefined): Promise<Page> {
  const { viewport, isMobile, hasTouch } = info.project.use;
  const ctx = await browser.newContext({ baseURL, viewport, isMobile, hasTouch });
  return ctx.newPage();
}

async function adminLogin(page: Page, admin: Admin) {
  await login(page, admin.email, admin.password);
  await expect(page).toHaveURL(/\/admin\/mfa$/, { timeout: 20_000 });
  await page.getByLabel("6-digit code").fill(totpCode(admin.totpSecret));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible({ timeout: 20_000 });
}

/** Moves a booking to start at `at()` (retrying on the no-overlap constraint, since other tests share the calendar). */
async function moveBooking(id: string, at: () => Date) {
  for (let attempt = 0; ; attempt++) {
    const start = at();
    start.setSeconds(0, 0);
    const end = new Date(start.getTime() + HOUR);
    const { error } = await serviceClient()
      .from("bookings")
      .update({ starts_at: start.toISOString(), ends_at: end.toISOString(), busy_until: end.toISOString() })
      .eq("id", id);
    if (error?.code === "23P01" && attempt < 20) continue;
    if (error) throw error;
    return start;
  }
}

test("journey: sign up, assessment, approval, Saturday block, late cancel, block paid, tax pack", async ({
  page,
  browser,
  baseURL,
}, info) => {
  test.setTimeout(240_000);
  const service = serviceClient();
  const tag = randomUUID().slice(0, 6);
  const fullName = `Jo${tag} Journey`;
  const child = { first: `Kit${tag}`, last: "Journey" };
  const childName = `${child.first} ${child.last}`;

  // 1. Parent signs up (UI, email confirmed through Mailpit) and adds a child.
  parent = await createParent(page, { fullName });
  // Signed in, the header leads back to the account rather than to sign-up.
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "Book Assessment" })).toHaveCount(0);
  await expect(header.getByRole("link", { name: "Your account" })).toBeVisible();
  await page.goto("/account/children/new");
  await page.getByLabel("First name").fill(child.first);
  await page.getByLabel("Last name").fill(child.last);
  await page.getByLabel("School year").selectOption("10");
  await page.getByLabel("Exam board").selectOption("AQA");
  await page.getByLabel("Tier").selectOption("Higher");
  await page.getByLabel("Combined Science").check();
  await page.getByRole("button", { name: "Save child" }).click();
  await expect(page).toHaveURL(/\/account\/children$/);

  // 2. Signs the agreement (multi-line medical notes keep their line breaks).
  await page.getByRole("link", { name: "Sign agreement" }).click();
  await page.getByLabel("Emergency contact name").fill("Gran Journey");
  await page.getByLabel("Emergency contact phone").fill("01632 960123");
  await page.getByLabel(/Medical information/).fill("Asthma\nInhaler in school bag");
  await page.getByLabel(/may contact me by phone and email/).check();
  await page.getByLabel(/I have read and agree/).check();
  await page.getByLabel("Type your full name to sign").fill(fullName);
  await page.getByRole("button", { name: "Sign agreement" }).click();
  await expect(page.getByRole("heading", { name: /^Signed on / })).toBeVisible();
  await expect(page.getByText(/Inhaler in school bag/)).toHaveCSS("white-space", "pre-line");

  // 3. Books the £10 Assessment Lesson at the tutor's place.
  await page.goto("/account/book");
  await page.getByRole("button", { name: new RegExp(`^${childName}`) }).click();
  await page.getByRole("button", { name: /^Assessment Lesson/ }).click();
  await page.getByRole("button", { name: /^At the tutor's place/ }).click();
  const slots = page.locator("[data-slot]");
  await expect(slots.first()).toBeVisible();
  await slots.nth(randomInt(0, Math.min(await slots.count(), 40))).click();
  await expect(page.getByTestId("total")).toHaveText("£10");
  await page.getByLabel(COOLING_OFF).check();
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page).toHaveURL(/\/account\/bookings\/[0-9a-f-]{36}$/);
  const assessmentId = page.url().split("/").pop()!;
  await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();

  // The lesson takes place.
  await moveBooking(assessmentId, () => new Date(Date.now() - 2 * DAY - randomInt(0, 36 * 12) * 5 * 60_000));

  // 4. Admin (password + TOTP) marks it attended and paid, then approves the child.
  const admin = await adminPage(browser, info, baseURL);
  await adminLogin(admin, await createAdmin());
  await expect(admin.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
  await admin.goto(`/admin/bookings?filter=all&q=${tag}`);
  const assessmentCard = admin.locator(`[data-booking-id="${assessmentId}"]`);
  await assessmentCard.getByRole("button", { name: "Mark attended" }).click();
  await expect(assessmentCard.getByText("Attended", { exact: true })).toBeVisible();
  await assessmentCard.getByRole("button", { name: "Mark paid (bank transfer)" }).click();
  await expect(assessmentCard.getByText("Paid", { exact: true })).toBeVisible();

  await admin.goto(`/admin/families/${parent.id}`);
  await expect(admin.getByText(/Inhaler in school bag/)).toHaveCSS("white-space", "pre-line");
  await admin.getByRole("button", { name: `Approve ${child.first} for lessons` }).click();
  await expect(admin.getByText("Approved", { exact: true })).toBeVisible();

  // 5. Parent books a Saturday 6-week block for £102.
  await page.goto("/account/book");
  await page.getByRole("button", { name: new RegExp(`^${childName}`) }).click();
  await page.getByRole("button", { name: /^Group block/ }).click();
  await page.getByLabel("Saturday group").check();
  await page.getByLabel("6 weeks, £102").check();
  await page.getByRole("button", { name: /^Starting / }).first().click();
  await expect(page.getByTestId("total")).toHaveText("£102");
  await page.getByLabel(COOLING_OFF).check();
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page).toHaveURL(/\/account\/bookings\//);
  await expect(page.getByTestId("booking-total")).toHaveText("£102");
  const reference = (await page.getByTestId("reference").textContent())!;
  expect(reference).toMatch(/^SLC-\d{4,}$/);

  // 6. The dashboard shows all 6 sessions, each with the block's reference to pay with.
  await page.goto("/account");
  const upcoming = page.getByRole("region", { name: "Upcoming bookings" });
  for (let week = 1; week <= 6; week++) {
    await expect(upcoming.getByText(`Week ${week} of 6`, { exact: true })).toBeVisible();
  }
  await expect(upcoming.getByText(`Reference ${reference}`)).toHaveCount(6);

  // 7. Near week 1, outside the cooling-off, the parent cancels it late: the dialog shows the fee.
  const block = (await service.from("block_bookings").select("id, price_pence").eq("payment_reference", reference).single()).data!;
  expect(block.price_pence).toBe(10200);
  const weeks = (await service.from("bookings").select("id").eq("block_booking_id", block.id).order("starts_at")).data!;
  expect(weeks).toHaveLength(6);
  await service.from("block_bookings").update({ created_at: new Date(Date.now() - 20 * DAY).toISOString() }).eq("id", block.id);
  await moveBooking(weeks[0].id, () => new Date(Date.now() + DAY + randomInt(0, 12) * 5 * 60_000));

  await page.reload();
  const week1 = upcoming.getByRole("listitem").filter({ hasText: "Week 1 of 6" });
  await week1.getByRole("button", { name: "Cancel booking" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("A late cancellation fee of £17 will be due")).toBeVisible();
  await dialog.getByRole("button", { name: "Yes, cancel and pay the fee" }).click();
  await expect(page.getByText(/Booking cancelled\. A late cancellation fee of £17/)).toBeVisible();
  const cancelled = (await service.from("bookings").select("status, cancelled_by").eq("id", weeks[0].id).single()).data;
  expect(cancelled).toEqual({ status: "late_cancelled", cancelled_by: "parent" });

  // 8. Admin marks the block paid (one £102 payment covers every week, the cancelled one included).
  await admin.goto(`/admin/bookings?filter=all&q=${tag}`);
  await admin.getByRole("button", { name: `Mark block paid (bank transfer) for ${childName} ${reference}` }).click();
  await expect(admin.getByText(reference)).toHaveCount(0);
  expect((await service.from("block_bookings").select("status").eq("id", block.id).single()).data?.status).toBe("paid");
  const ledger = await service.from("ledger").select("kind, amount_pence, method").eq("block_booking_id", block.id);
  expect(ledger.data).toEqual([{ kind: "payment", amount_pence: 10200, method: "bank_transfer" }]);

  // 9. Admin downloads the Tax Year Pack: the Income sheet has the £102 (10200 pence) block payment.
  await admin.goto("/admin/money/tax");
  await expect(admin.getByRole("heading", { name: "Tax Year Pack" })).toBeVisible();
  const year = (await admin.locator("h2").first().textContent())!.slice(0, 7);
  const xlsx = await admin.request.get(`/api/admin/tax-pack?year=${year}&format=xlsx`);
  expect(xlsx.status()).toBe(200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await xlsx.body()) as never);
  const income = wb.getWorksheet("2. Income")!;
  const ours: { family: string; method: string; amount: number }[] = [];
  income.eachRow((row) => {
    const family = String(row.getCell(2).value ?? "");
    if (family.includes(fullName)) {
      ours.push({ family, method: String(row.getCell(3).value), amount: Number(row.getCell(4).value) });
    }
  });
  const blockRow = ours.find((r) => r.family.includes("Block booking"));
  expect(blockRow).toEqual({ family: `${fullName} · Block booking`, method: "Bank transfer", amount: 102 });
  expect(Math.round(blockRow!.amount * 100)).toBe(10200);
  expect(ours.map((r) => r.amount).sort((a, b) => a - b)).toEqual([10, 102]);

  await admin.context().close();
});
