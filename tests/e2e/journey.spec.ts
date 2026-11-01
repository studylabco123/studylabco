/**
 * The whole parent/admin journey from spec §8.4, at both viewports (it runs in
 * the "iphone" and "windows" projects; it changes no shared settings):
 *
 * parent signs up → adds a child → signs the agreement → books an Assessment
 * Lesson at the tutor's place → admin (TOTP) marks it attended (and paid) and
 * approves the child → parent buys a KS3 6-session group pass (£79) → admin
 * marks it paid → parent books a Saturday session with it → near the session
 * the parent is told to call → the tutor records the late cancellation (the
 * session goes back on the pass, £6.58 owed) → admin downloads the Tax Year
 * Pack, whose Income sheet holds the £79 group pass payment.
 *
 * Time travel, done with the service client because the server's clock can't
 * be moved:
 * - The assessment is moved into the past ("the lesson takes place") so the
 *   admin can mark it attended (only started lessons can be).
 * - Before the late cancellation the pass's created_at is set 20 days back
 *   and the session is moved to start in about a day ("the parent comes back
 *   near the session"). A cancellation within 14 days of buying the pass is
 *   free (cooling-off), so without the backdating it would rightly be free
 *   and the fee path would go untested.
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

test("journey: sign up, assessment, approval, group pass paid, pass session, late cancel, tax pack", async ({
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

  // 5. Parent buys a KS3 6-session group pass for £79. The Saturday group is KS3 only, so the child is a KS3 pupil from here.
  await service.from("children").update({ school_year: 8, level: "KS3", exam_board: null, tier: null }).eq("parent_id", parent.id);
  await page.goto("/account/book");
  await page.getByRole("button", { name: new RegExp(`^${childName}`) }).click();
  await page.getByRole("button", { name: /^Group pass/ }).click();
  await page.getByRole("button", { name: /^6 sessions/ }).click();
  await expect(page.getByTestId("total")).toHaveText("£79");
  await page.getByLabel(COOLING_OFF).check();
  await page.getByRole("button", { name: "Buy pass" }).click();
  const passes = page.getByRole("region", { name: "Group passes" });
  await expect(passes.getByText("KS3 group pass — 6 sessions — awaiting payment")).toBeVisible();
  const reference = (await passes.getByTestId("pass-reference").textContent())!.trim();
  expect(reference).toMatch(/^SLC-\d{4,}$/);

  // 6. Admin marks the pass paid (one £79 payment, counted as income).
  await admin.goto("/admin/money");
  await admin.getByRole("button", { name: `Mark pass paid (bank transfer) for ${reference}` }).click();
  await expect(admin.getByRole("button", { name: `Mark pass paid (bank transfer) for ${reference}` })).toHaveCount(0);
  const pass = (await service.from("passes").select("id, price_pence, status").eq("payment_reference", reference).single()).data!;
  expect(pass).toMatchObject({ price_pence: 7900, status: "active" });
  const ledger = await service.from("ledger").select("kind, amount_pence, method").eq("pass_id", pass.id);
  expect(ledger.data).toEqual([{ kind: "payment", amount_pence: 7900, method: "bank_transfer" }]);

  // 7. The parent books a Saturday session a week or more ahead with the pass.
  await page.reload();
  await passes.getByRole("link", { name: "Book a session" }).click();
  const options = page.locator("[data-pass-session]");
  await expect(options.first()).toBeVisible();
  await options.nth(randomInt(0, await options.count())).click();
  await page.getByRole("button", { name: "Book with pass" }).click();
  await expect(page).toHaveURL(/\/account\/bookings\/[0-9a-f-]{36}$/);
  const seatId = page.url().split("/").pop()!;
  await page.goto("/account");
  await expect(passes.getByText(/^KS3 group pass — 5 of 6 sessions left — expires /)).toBeVisible();

  // 8. Near the session, outside the cooling-off, the parent sees the call/email message instead of a cancel button.
  await service.from("passes").update({ created_at: new Date(Date.now() - 20 * DAY).toISOString() }).eq("id", pass.id);
  await moveBooking(seatId, () => new Date(Date.now() + DAY + randomInt(0, 12) * 5 * 60_000));
  await page.reload();
  const upcoming = page.getByRole("region", { name: "Upcoming bookings" });
  const seat = upcoming.getByRole("listitem").filter({ hasText: "Group pass" });
  await expect(seat.getByText(/Less than 48 hours to go — please call or email Study Lab Co to cancel\. A 50% late cancellation fee applies\./)).toBeVisible();
  await expect(seat.getByRole("button", { name: "Cancel booking" })).toHaveCount(0);

  // 9. The parent phones; the tutor records the late cancellation: the session goes back on the pass and half a session's value (£6.58) is owed.
  await admin.goto(`/admin/bookings?filter=all&q=${tag}`);
  const card = admin.locator(`[data-booking-id="${seatId}"]`);
  await expect(card.getByText("Pass", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: `Record late cancellation for ${childName}` }).click();
  await admin.getByRole("button", { name: "Yes, record it" }).click();
  await expect(card.getByText("Late cancelled", { exact: true })).toBeVisible();
  expect((await service.from("bookings").select("status, fee_pence").eq("id", seatId).single()).data).toEqual({ status: "late_cancelled", fee_pence: 658 });
  await page.reload();
  await expect(page.getByTestId("owed")).toHaveText("£6.58");
  await expect(passes.getByText(/^KS3 group pass — 6 of 6 sessions left — expires /)).toBeVisible();

  // 10. Admin downloads the Tax Year Pack: the Income sheet has the £79 (7900 pence) group pass payment.
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
  const passRow = ours.find((r) => r.family.includes("Group pass"));
  expect(passRow).toEqual({ family: `${fullName} · Group pass (KS3, 6 sessions)`, method: "Bank transfer", amount: 79 });
  expect(Math.round(passRow!.amount * 100)).toBe(7900);
  expect(ours.map((r) => r.amount).sort((a, b) => a - b)).toEqual([10, 79]);

  await admin.context().close();
});
