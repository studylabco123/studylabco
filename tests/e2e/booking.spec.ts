import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { formatLondon } from "../../src/lib/format";
import {
  createParent,
  deleteBookingsFor,
  seedChild,
  serviceClient,
  setBankDetails,
  TEST_BANK,
  type Parent,
} from "./helpers";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const COOLING_OFF = /I want lessons to start within 14 days/;

let parent: Parent | undefined;

test.beforeAll(setBankDetails);
test.afterEach(async () => {
  if (parent) await deleteBookingsFor(parent.id);
  parent = undefined;
});

async function start(page: Page, opts: { approved?: boolean; firstName?: string } = {}) {
  parent = await createParent(page);
  await seedChild(parent.id, { approved: opts.approved, firstName: opts.firstName ?? "Sam" });
  await page.goto("/account/book");
  await page.getByRole("button", { name: new RegExp(`^${opts.firstName ?? "Sam"} Parent`) }).click();
}

/**
 * Picks one of the offered slots at random, so tests running side by side
 * rarely want the same time. Returns its start.
 */
async function pickSlot(page: Page): Promise<Date> {
  const slots = page.locator("[data-slot]");
  await expect(slots.first()).toBeVisible();
  const n = await slots.count();
  const slot = slots.nth(Math.floor(Math.random() * Math.min(n, 40)));
  const iso = (await slot.getAttribute("data-slot"))!;
  await slot.click();
  return new Date(iso);
}

async function chooseHomeVisit(page: Page, postcode: string) {
  await page.getByRole("button", { name: /^Home visit/ }).click();
  await page.getByLabel("Address line").fill("1 Test Street, Blackburn");
  await page.getByLabel("Postcode").fill(postcode);
  await page.getByRole("button", { name: "Continue" }).click();
}

async function toTutorPlaceReview(page: Page): Promise<Date> {
  await start(page);
  await page.getByRole("button", { name: /^Assessment Lesson/ }).click();
  await page.getByRole("button", { name: /^At the tutor's place/ }).click();
  const at = await pickSlot(page);
  await expect(page.getByRole("heading", { name: "Check and confirm" })).toBeVisible();
  return at;
}

test.describe("booking", () => {
  test("new parent books £10 assessment at tutor's place and sees reference SLC-#### and bank details", async ({ page }) => {
    await toTutorPlaceReview(page);
    await expect(page.getByTestId("total")).toHaveText("£10");
    await page.getByLabel(COOLING_OFF).check();
    await page.getByRole("button", { name: "Confirm booking" }).click();

    await expect(page).toHaveURL(/\/account\/bookings\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId("reference")).toHaveText(/^SLC-\d{4,}$/);
    const reference = await page.getByTestId("reference").textContent();
    await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();
    await expect(page.getByTestId("booking-total")).toHaveText("£10");
    const bank = page.getByLabel("Bank details");
    for (const value of [TEST_BANK.name, TEST_BANK.sortCode, TEST_BANK.accountNumber, reference!]) {
      await expect(bank.getByText(value, { exact: true })).toBeVisible();
    }
    await expect(page.getByText(TEST_BANK.teachingAddress)).toBeVisible();
    const axe = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(axe.violations).toEqual([]);

    const { data } = await serviceClient()
      .from("bookings")
      .select("kind, location, status, price_pence, payment_reference")
      .eq("parent_id", parent!.id)
      .single();
    expect(data).toMatchObject({ kind: "assessment", location: "tutor_place", status: "confirmed", price_pence: 1000 });
    expect(data?.payment_reference).toBe(reference);
    const { data: consents } = await serviceClient()
      .from("consents")
      .select("kind, booking_id")
      .eq("profile_id", parent!.id)
      .eq("kind", "cooling_off");
    expect(consents).toHaveLength(1);
  });

  test("group options hidden until approved", async ({ page }) => {
    await start(page);
    await expect(page.getByRole("button", { name: /^Assessment Lesson/ })).toBeVisible();
    for (const name of [/^1-to-1 lesson/, /^Group session/, /^Sunday bundle/, /^Group block/]) {
      await expect(page.getByRole("button", { name })).toHaveCount(0);
    }

    await seedChild(parent!.id, { approved: true, firstName: "Ali" });
    await page.goto("/account/book");
    await page.getByRole("button", { name: /^Ali Parent/ }).click();
    for (const name of [/^1-to-1 lesson/, /^Group session/, /^Sunday bundle/, /^Group block/]) {
      await expect(page.getByRole("button", { name })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: /^Assessment Lesson/ })).toHaveCount(0);
  });

  test('home visit with BB3 postcode shows "We only visit BB1 and BB2 postcodes"', async ({ page }) => {
    await start(page);
    await page.getByRole("button", { name: /^Assessment Lesson/ }).click();
    await chooseHomeVisit(page, "BB3 1AA");
    await expect(page.getByText("We only visit BB1 and BB2 postcodes.")).toBeVisible();
    await expect(page.locator("[data-slot]")).toHaveCount(0);
  });

  test('no "online" text anywhere in the wizard while disabled', async ({ page }) => {
    const body = page.locator("body");
    parent = await createParent(page);
    await seedChild(parent.id, { approved: true });
    await page.goto("/account/book");
    await expect(body).not.toContainText(/online/i);
    await page.getByRole("button", { name: /^Sam Parent/ }).click();
    await expect(body).not.toContainText(/online/i);
    await page.getByRole("button", { name: /^1-to-1 lesson/ }).click();
    await expect(page.getByRole("button", { name: /^At the tutor's place/ })).toBeVisible();
    await expect(body).not.toContainText(/online/i);
    await page.getByRole("button", { name: /^At the tutor's place/ }).click();
    await pickSlot(page);
    await expect(page.getByRole("heading", { name: "Check and confirm" })).toBeVisible();
    await expect(body).not.toContainText(/online/i);
    // Review -> slot -> location -> type.
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("button", { name: /^Group block/ }).click();
    await expect(body).not.toContainText(/online/i);
  });

  test("price summary shows £15 for home-visit assessment before confirming", async ({ page }) => {
    await start(page);
    await page.getByRole("button", { name: /^Assessment Lesson/ }).click();
    await chooseHomeVisit(page, "bb2 4hp");
    const at = await pickSlot(page);
    expect(formatLondon(at, "EEEE")).toBe("Sunday");
    await expect(page.getByTestId("total")).toHaveText("£15");
    await expect(page.getByText("Assessment Lesson: £10")).toBeVisible();
    await expect(page.getByText("Travel fee: £5")).toBeVisible();
    await expect(page.getByText("Home visit: 1 Test Street, Blackburn, BB2 4HP")).toBeVisible();
    await expect(page.getByText(/confirmed once the tutor approves/)).toBeVisible();
    const axe = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(axe.violations).toEqual([]);

    await page.getByLabel(COOLING_OFF).check();
    await page.getByRole("button", { name: "Confirm booking" }).click();
    await expect(page.getByText("Pending tutor approval")).toBeVisible();
    await expect(page.getByTestId("booking-total")).toHaveText("£15");
    // The teaching address is never shown for home visits.
    await expect(page.getByText(TEST_BANK.teachingAddress)).toHaveCount(0);
  });

  test("late-cancellation and 48-hour policy shown before confirm", async ({ page }) => {
    const at = await toTutorPlaceReview(page);
    const deadline = formatLondon(new Date(at.getTime() - 48 * 3600_000), "EEEE d MMMM yyyy, HH:mm");
    await expect(page.getByText("You can cancel for free up to 48 hours before the lesson.")).toBeVisible();
    await expect(
      page.getByText(`Free cancellation until ${deadline}. After that a late cancellation fee of £10 applies.`),
    ).toBeVisible();
    await expect(page.getByText(/\b(fine|penalty)\b/i)).toHaveCount(0);
  });

  test("cannot confirm without cooling-off tick", async ({ page }) => {
    await toTutorPlaceReview(page);
    await expect(page.getByLabel(COOLING_OFF)).not.toBeChecked();
    await page.getByRole("button", { name: "Confirm booking" }).click();
    await expect(page.getByText(/Please tick the box/)).toBeVisible();
    await expect(page).toHaveURL(/\/account\/book$/);
    const { count } = await serviceClient()
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("parent_id", parent!.id);
    expect(count).toBe(0);
  });

  test("approved child books a 6-week Saturday block for £102", async ({ page }) => {
    await start(page, { approved: true });
    await page.getByRole("button", { name: /^Group block/ }).click();
    await page.getByLabel("Saturday group").check();
    await page.getByLabel("6 weeks, £102").check();
    await page.getByRole("button", { name: /^Starting / }).first().click();
    await expect(page.getByTestId("total")).toHaveText("£102");
    await expect(page.getByText("Location confirmed on booking")).toBeVisible();
    await page.getByLabel(COOLING_OFF).check();
    await page.getByRole("button", { name: "Confirm booking" }).click();

    await expect(page).toHaveURL(/\/account\/bookings\//);
    await expect(page.getByTestId("reference")).toHaveText(/^SLC-\d{4,}$/);
    await expect(page.getByTestId("booking-total")).toHaveText("£102");
    await expect(page.getByText("Location confirmed on booking")).toBeVisible();
    await expect(page.getByText(/Seats are held until/)).toBeVisible();
    await expect(page.getByText(TEST_BANK.teachingAddress)).toHaveCount(0);
    const { count } = await serviceClient()
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("parent_id", parent!.id);
    expect(count).toBe(6);
  });
});
