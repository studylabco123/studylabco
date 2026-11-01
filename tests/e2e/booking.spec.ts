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

async function start(page: Page, opts: { approved?: boolean; firstName?: string; ks3?: boolean; schoolYear?: number } = {}) {
  parent = await createParent(page);
  await seedChild(parent.id, { approved: opts.approved, firstName: opts.firstName ?? "Sam", ks3: opts.ks3, schoolYear: opts.schoolYear });
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

    // Unpaid: the badge says so and the page asks for £10. Once paid: "Paid", and no bank details (review I1).
    await expect(page.getByTestId("payment-badge")).toHaveText("Unpaid");
    await expect(page.getByTestId("to-pay")).toHaveText("£10");
    await serviceClient().from("bookings").update({ payment_status: "paid" }).eq("parent_id", parent!.id);
    await page.reload();
    await expect(page.getByTestId("payment-badge")).toHaveText("Paid");
    await expect(page.getByRole("heading", { name: "How to pay" })).toHaveCount(0);
    await expect(page.getByLabel("Bank details")).toHaveCount(0);
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
    // Awaiting approval: nothing is asked for yet (review I1).
    await expect(page.getByText(/Please do not pay until it is confirmed/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "How to pay" })).toHaveCount(0);
    // The teaching address is never shown for home visits.
    await expect(page.getByText(TEST_BANK.teachingAddress)).toHaveCount(0);
  });

  test("late-cancellation and 48-hour policy shown before confirm", async ({ page }) => {
    const at = await toTutorPlaceReview(page);
    const deadline = formatLondon(new Date(at.getTime() - 48 * 3600_000), "EEEE d MMMM yyyy, HH:mm");
    await expect(
      page.getByText(
        "You can cancel for free up to 48 hours before the lesson, and at any time in the first 14 days after booking (your cooling-off period).",
      ),
    ).toBeVisible();
    // Ruling R20: inside the 14-day cooling-off cancelling is free whatever the notice.
    const daysAway = (at.getTime() - Date.now()) / 86_400_000;
    if (daysAway <= 14) {
      await expect(page.getByText("The lesson starts within your 14-day cooling-off period, so you can cancel it for free at any time before it starts.")).toBeVisible();
      await expect(page.getByText(/Free cancellation until/)).toHaveCount(0);
    } else if (daysAway > 16) {
      await expect(page.getByText(`Free cancellation until ${deadline} (or any time in the first 14 days after booking). After that, cancel by phone or email; a late cancellation fee of £5 (50%) applies.`)).toBeVisible();
    } else {
      await expect(page.getByText(/^Free cancellation until .* \(or any time in the first 14 days after booking\)\. After that, cancel by phone or email; a late cancellation fee of £5 \(50%\) applies\.$/)).toBeVisible();
    }
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

  test("KS3 child wizard offers 1-to-1 at £20 and only KS3 groups", async ({ page }) => {
    await start(page, { approved: true, ks3: true });
    await expect(page.getByRole("button", { name: /^1-to-1 lesson.*£20 \(home visit £25\)/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Group session.*£14/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Sunday bundle/ })).toHaveCount(0);

    await page.getByRole("button", { name: /^Group session/ }).click();
    const sessions = page.getByRole("list", { name: "Group sessions" }).getByRole("button", { name: /^\w+day/ });
    await expect(sessions.first()).toBeVisible();
    for (const name of await sessions.allTextContents()) {
      expect(name).toContain("KS3");
      expect(name).toContain("£14");
      expect(name).not.toContain("Sunday");
    }
    await page.getByRole("button", { name: "Back" }).click();

    await page.getByRole("button", { name: /^1-to-1 lesson/ }).click();
    await page.getByRole("button", { name: /^At the tutor's place/ }).click();
    await pickSlot(page);
    await expect(page.getByText("1-to-1 lesson: £20")).toBeVisible();
    await expect(page.getByTestId("total")).toHaveText("£20");
    await page.getByLabel(COOLING_OFF).check();
    await page.getByRole("button", { name: "Confirm booking" }).click();
    await expect(page).toHaveURL(/\/account\/bookings\/[0-9a-f-]{36}$/);
    const { data } = await serviceClient().from("bookings").select("kind, price_pence").eq("parent_id", parent!.id).single();
    expect(data).toEqual({ kind: "one_to_one", price_pence: 2000 });
  });

  test("Year 9 KS3 child's assessment costs £10", async ({ page }) => {
    await start(page, { ks3: true, schoolYear: 9, firstName: "Nia" });
    await expect(page.getByRole("button", { name: /^Assessment Lesson.*£10 \(home visit £15\)/ })).toBeVisible();
    await page.getByRole("button", { name: /^Assessment Lesson/ }).click();
    await page.getByRole("button", { name: /^At the tutor's place/ }).click();
    await pickSlot(page);
    await expect(page.getByTestId("total")).toHaveText("£10");

    // A Year 8 (KS3) child's assessment is the KS3 price.
    await seedChild(parent!.id, { ks3: true, firstName: "Kay" });
    await page.goto("/account/book");
    await page.getByRole("button", { name: /^Kay Parent/ }).click();
    await expect(page.getByRole("button", { name: /^Assessment Lesson.*£7\.50 \(home visit £12\.50\)/ })).toBeVisible();
  });

  test("info icon opens and closes with keyboard", async ({ page }) => {
    await start(page, { approved: true });
    const tip = page.getByRole("button", { name: "More about Sunday bundle" });
    await expect(tip).toHaveAttribute("aria-expanded", "false");
    await tip.focus();
    await page.keyboard.press("Enter");
    await expect(tip).toHaveAttribute("aria-expanded", "true");
    const panel = page.locator(`#${await tip.getAttribute("aria-controls")}`);
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Sunday");
    await page.keyboard.press("Escape");
    await expect(tip).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toHaveCount(0);
    await expect(tip).toBeFocused();
    await page.keyboard.press("Space");
    await expect(tip).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Space");
    await expect(tip).toHaveAttribute("aria-expanded", "false");
    // Every lesson type has one.
    for (const t of ["1-to-1 lesson", "Group session", "Group block"]) {
      await expect(page.getByRole("button", { name: `More about ${t}` })).toBeVisible();
    }
    // Locations, and the review step's cooling-off and late-fee lines.
    await page.getByRole("button", { name: /^1-to-1 lesson/ }).click();
    await expect(page.getByRole("button", { name: "More about At the tutor's place" })).toBeVisible();
    await expect(page.getByRole("button", { name: "More about Home visit" })).toBeVisible();
    await page.getByRole("button", { name: /^At the tutor's place/ }).click();
    await pickSlot(page);
    const late = page.getByRole("button", { name: "More about the late cancellation fee" });
    await late.click();
    await expect(page.getByText(/50% of the lesson price/).first()).toBeVisible();
    const cooling = page.getByRole("button", { name: "More about the cooling-off period" });
    // Tapping another tip opens it and closes the first.
    await cooling.click();
    await expect(cooling).toHaveAttribute("aria-expanded", "true");
    await expect(late).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(`#${await cooling.getAttribute("aria-controls")}`)).toContainText("14 days");
    const axe = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(axe.violations).toEqual([]);
  });

  test("approved KS3 child books a 6-week Saturday block for £102", async ({ page }) => {
    // The Saturday group is KS3 only.
    await start(page, { approved: true, ks3: true });
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
