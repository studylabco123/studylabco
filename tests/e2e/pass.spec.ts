/**
 * Group passes end to end: a parent buys a KS3 6-session pass, the tutor
 * marks it paid, the parent books a Saturday session at least a week ahead
 * with it and the dashboard counts it off the pass.
 */
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { randomInt } from "node:crypto";
import {
  createAdmin,
  createParent,
  deleteBookingsFor,
  login,
  seedChild,
  serviceClient,
  setBankDetails,
  TEST_BANK,
  totpCode,
  type Admin,
  type Parent,
} from "./helpers";

const COOLING_OFF = /I want lessons to start within 14 days/;
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

test("parent buys KS3 6-pass (£79), admin marks paid, parent books a Saturday session a week+ ahead, dashboard shows 5 of 6 left", async ({
  page,
  browser,
  baseURL,
}, info) => {
  test.setTimeout(180_000);
  parent = await createParent(page);
  await seedChild(parent.id, { approved: true, ks3: true, firstName: "Robin" });

  // 1. Buy the pass in the booking wizard.
  await page.goto("/account/book");
  await page.getByRole("button", { name: /^Robin Parent/ }).click();
  await page.getByRole("button", { name: /^Group pass/ }).click();
  await page.getByRole("button", { name: /^6 sessions/ }).click();
  await expect(page.getByTestId("total")).toHaveText("£79");
  await page.getByLabel(COOLING_OFF).check();
  await page.getByRole("button", { name: "Buy pass" }).click();

  // 2. The dashboard shows the pass awaiting payment with its reference and the bank details.
  await expect(page).toHaveURL(/\/account(\?|$)/);
  const passes = page.getByRole("region", { name: "Group passes" });
  await expect(passes.getByText("KS3 group pass — 6 sessions — awaiting payment")).toBeVisible();
  const reference = (await passes.getByTestId("pass-reference").first().textContent())!.trim();
  expect(reference).toMatch(/^SLC-\d{4,}$/);
  await expect(passes.getByText(TEST_BANK.sortCode)).toBeVisible();
  await expect(passes.getByText(/Sessions unlock once we've received your payment/)).toBeVisible();
  await expect(passes.getByRole("link", { name: "Book a session" })).toHaveCount(0);

  // 3. The tutor marks it paid from the Money page.
  const admin = await adminPage(browser, info, baseURL);
  await adminLogin(admin, await createAdmin());
  await admin.goto("/admin/money");
  const adminPasses = admin.getByRole("region", { name: "Group passes" });
  await adminPasses.getByRole("button", { name: `Mark pass paid (bank transfer) for ${reference}` }).click();
  await expect(adminPasses.getByRole("button", { name: `Mark pass paid (bank transfer) for ${reference}` })).toHaveCount(0);
  const ledger = await serviceClient().from("ledger").select("kind, amount_pence, pass_id").eq("parent_id", parent.id);
  expect(ledger.data).toEqual([{ kind: "payment", amount_pence: 7900, pass_id: expect.any(String) }]);
  await admin.context().close();

  // 4. The parent books a Saturday session at least a week ahead with the pass.
  await page.reload();
  await expect(passes.getByText(/^KS3 group pass — 6 of 6 sessions left — expires \d{1,2} \w+ \d{4}$/)).toBeVisible();
  await passes.getByRole("link", { name: "Book a session" }).click();
  const options = page.locator("[data-pass-session]");
  await expect(options.first()).toBeVisible();
  const n = await options.count();
  const chosen = options.nth(randomInt(0, n));
  const startsAt = new Date((await chosen.getAttribute("data-pass-session"))!);
  expect(startsAt.getTime() - Date.now()).toBeGreaterThanOrEqual(7 * 86_400_000);
  await chosen.click();
  await expect(page.getByText("Uses 1 session of your pass")).toBeVisible();
  await page.getByRole("button", { name: "Book with pass" }).click();
  await expect(page).toHaveURL(/\/account\/bookings\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Group pass", { exact: true })).toBeVisible();

  // 5. The dashboard counts it off the pass.
  await page.goto("/account");
  await expect(passes.getByText(/^KS3 group pass — 5 of 6 sessions left — expires /)).toBeVisible();
});
