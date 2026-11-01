import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { randomInt, randomUUID } from "node:crypto";
import { formatLondon } from "../../src/lib/format";
import { londonDateOf } from "../../src/lib/time";
import {
  createAdmin,
  createParent,
  deleteBookingsFor,
  login,
  seedChild,
  serviceClient,
  totpCode,
  type Admin,
} from "./helpers";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const DAY = 86_400_000;

async function adminLogin(page: Page, admin: Admin) {
  await login(page, admin.email, admin.password);
  await expect(page).toHaveURL(/\/admin\/mfa$/, { timeout: 20_000 });
  await page.getByLabel("6-digit code").fill(totpCode(admin.totpSecret));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible({ timeout: 20_000 });
}

const unique = () => randomUUID().slice(0, 6);

/** A parent (no UI sign-up needed) with a unique name, so lists can be searched for it. */
async function seedParent(phone = "07123 456789") {
  const tag = unique();
  const fullName = `Fam${tag} Parent`;
  const email = `fam-${tag}-${randomUUID().slice(0, 6)}@example.test`;
  const { data, error } = await serviceClient().auth.admin.createUser({
    email,
    password: "correct-horse-battery",
    email_confirm: true,
    user_metadata: { full_name: fullName, phone },
  });
  if (error) throw error;
  return { id: data.user.id, fullName, email, tag };
}

/** Inserts a one-to-one or assessment `daysAhead` days from now (negative = past), at a random time, retrying on clashes. */
async function seedBooking(
  parentId: string,
  childId: string,
  opts: {
    daysAhead: number;
    kind?: "one_to_one" | "assessment";
    location?: string;
    status?: string;
    payment?: string;
    price?: number;
    travel?: number;
    address?: string;
    startsAt?: () => Date;
  },
) {
  for (let attempt = 0; ; attempt++) {
    // Jitter (up to 36h, in the direction of daysAhead) keeps parallel tests off each other's hours.
    const jitter = randomInt(0, 36 * 12) * 5 * 60_000 * (opts.daysAhead < 0 ? -1 : 1);
    const start = opts.startsAt?.() ?? new Date(Date.now() + opts.daysAhead * DAY + jitter);
    start.setSeconds(0, 0);
    const end = new Date(start.getTime() + 3600_000);
    const { data, error } = await serviceClient()
      .from("bookings")
      .insert({
        parent_id: parentId,
        child_id: childId,
        kind: opts.kind ?? "one_to_one",
        location: opts.location ?? "tutor_place",
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        busy_until: end.toISOString(),
        status: opts.status ?? "confirmed",
        payment_status: opts.payment ?? "unpaid",
        price_pence: opts.price ?? 2500,
        travel_fee_pence: opts.travel ?? 0,
        home_address: opts.address ?? null,
        home_postcode: opts.address ? "BB1 1AA" : null,
      })
      .select("id, payment_reference")
      .single();
    if (error?.code === "23P01" && attempt < 20) continue;
    if (error) throw error;
    return data as { id: string; payment_reference: string };
  }
}

const bookingCard = (page: Page, id: string) => page.locator(`[data-booking-id="${id}"]`);
async function openBookings(page: Page, q: string, filter = "all") {
  await page.goto(`/admin/bookings?filter=${filter}&q=${encodeURIComponent(q)}`);
}

const cleanup: string[] = [];
test.afterEach(async () => {
  for (const id of cleanup.splice(0)) {
    await deleteBookingsFor(id);
    await serviceClient().from("ledger").delete().eq("parent_id", id);
    await serviceClient().auth.admin.deleteUser(id);
  }
});

test.describe("admin operations", () => {
  test("mark paid writes ledger and shows Paid", async ({ page }) => {
    const parent = await seedParent();
    cleanup.push(parent.id);
    const childId = await seedChild(parent.id, { approved: true, firstName: `Kid${parent.tag}` });
    const b = await seedBooking(parent.id, childId, { daysAhead: -3, status: "attended", price: 2500 });
    await adminLogin(page, await createAdmin());

    await openBookings(page, parent.tag);
    const card = bookingCard(page, b.id);
    await expect(card.getByText("Unpaid", { exact: true })).toBeVisible();
    await card.getByRole("button", { name: "Mark paid (bank transfer)" }).click();
    await expect(card.getByText("Paid", { exact: true })).toBeVisible();

    const { data } = await serviceClient().from("ledger").select("kind, amount_pence, method, occurred_on").eq("booking_id", b.id);
    expect(data).toEqual([
      { kind: "payment", amount_pence: 2500, method: "bank_transfer", occurred_on: londonDateOf(new Date()) },
    ]);
    const row = await serviceClient().from("bookings").select("payment_status").eq("id", b.id).single();
    expect(row.data?.payment_status).toBe("paid");
  });

  test("cannot approve before attended assessment; can after", async ({ page }) => {
    const parent = await seedParent();
    cleanup.push(parent.id);
    const name = `Kid${parent.tag}`;
    const childId = await seedChild(parent.id, { firstName: name });
    const b = await seedBooking(parent.id, childId, { daysAhead: -2, kind: "assessment", price: 1000 });
    await adminLogin(page, await createAdmin());

    await page.goto(`/admin/families/${parent.id}`);
    await page.getByRole("button", { name: `Approve ${name} for lessons` }).click();
    await expect(page.getByRole("alert").filter({ hasText: /attended/i })).toBeVisible();
    const before = await serviceClient().from("student_status").select("approved_at").eq("child_id", childId).maybeSingle();
    expect(before.data?.approved_at ?? null).toBeNull();

    await openBookings(page, parent.tag);
    await bookingCard(page, b.id).getByRole("button", { name: "Mark attended" }).click();
    await expect(bookingCard(page, b.id).getByText("Attended", { exact: true })).toBeVisible();

    await page.goto(`/admin/families/${parent.id}`);
    await page.getByRole("button", { name: `Approve ${name} for lessons` }).click();
    await expect(page.getByText("Approved", { exact: true })).toBeVisible();
    const after = await serviceClient().from("student_status").select("approved_at").eq("child_id", childId).single();
    expect(after.data?.approved_at).not.toBeNull();
  });

  test("approving home visit emails parent and creates mileage row", async ({ page }) => {
    const parent = await seedParent();
    cleanup.push(parent.id);
    const childId = await seedChild(parent.id, { approved: true, firstName: `Kid${parent.tag}` });
    const b = await seedBooking(parent.id, childId, {
      daysAhead: 6,
      status: "pending",
      location: "home_visit",
      address: "9 Test Street, Blackburn",
      price: 2500,
      travel: 500,
    });
    await adminLogin(page, await createAdmin());

    await openBookings(page, parent.tag);
    const card = bookingCard(page, b.id);
    await expect(card.getByText("Needs approval")).toBeVisible();
    await card.getByRole("button", { name: "Approve home visit" }).click();
    await expect(card.getByText("Confirmed", { exact: true })).toBeVisible();

    const when = (await serviceClient().from("bookings").select("starts_at, status").eq("id", b.id).single()).data!;
    expect(when.status).toBe("confirmed");
    const mileage = await serviceClient().from("mileage").select("trip_on, miles").eq("booking_id", b.id);
    expect(mileage.data).toEqual([{ trip_on: londonDateOf(new Date(when.starts_at)), miles: null }]);
    const log = await serviceClient().from("email_log").select("template, to_email").eq("booking_id", b.id);
    expect(log.data).toEqual([{ template: "home_visit_decision", to_email: parent.email }]);
  });

  test("blocked parent sees \"Please contact Study Lab Co\" when booking", async ({ page, browser, baseURL }) => {
    const ctx = await browser.newContext({ baseURL });
    const parentPage = await ctx.newPage();
    const parent = await createParent(parentPage, { fullName: `Fam${unique()} Blocked` });
    cleanup.push(parent.id);
    await seedChild(parent.id, { approved: true });
    await adminLogin(page, await createAdmin());

    await page.goto(`/admin/families/${parent.id}`);
    await page.getByLabel("Reason (only you can see this)").fill("Repeated no-shows");
    await page.getByRole("button", { name: "Block account" }).click();
    await expect(page.getByRole("button", { name: "Unblock account" })).toBeVisible();
    await expect(page.getByText("Repeated no-shows")).toBeVisible();

    await parentPage.goto("/account/book");
    await parentPage.getByRole("button", { name: /^Sam Parent/ }).click();
    await expect(parentPage.getByText("Please contact Study Lab Co.")).toBeVisible();
    await expect(parentPage.getByText("Repeated no-shows")).toHaveCount(0);

    await page.getByRole("button", { name: "Unblock account" }).click();
    await expect(page.getByRole("button", { name: "Block account" })).toBeVisible();
    await ctx.close();
  });

  test("flagged parent appears in alerts after 2 late cancellations", async ({ page }) => {
    const parent = await seedParent();
    cleanup.push(parent.id);
    const childId = await seedChild(parent.id, { approved: true });
    await seedBooking(parent.id, childId, { daysAhead: -10, status: "late_cancelled", payment: "waived" });
    await adminLogin(page, await createAdmin());
    await page.goto("/admin");
    const alerts = page.getByRole("region", { name: "Needs your attention" });
    await expect(alerts.getByRole("link", { name: parent.fullName })).toHaveCount(0);

    await seedBooking(parent.id, childId, { daysAhead: -20, status: "late_cancelled", payment: "waived" });
    await page.reload();
    await expect(alerts.getByRole("link", { name: parent.fullName })).toBeVisible();
  });

  test("tap-to-call link is tel:+447…", async ({ page }) => {
    const parent = await seedParent("07123 456789");
    cleanup.push(parent.id);
    await seedChild(parent.id, { firstName: `Kid${parent.tag}` });
    await adminLogin(page, await createAdmin());
    await page.goto(`/admin/families/${parent.id}`);
    await expect(page.getByRole("link", { name: /^Call/ })).toHaveAttribute("href", "tel:+447123456789");
    await expect(page.getByRole("link", { name: /^WhatsApp/ })).toHaveAttribute("href", "https://wa.me/447123456789");
    await expect(page.getByRole("link", { name: /^Email/ })).toHaveAttribute("href", `mailto:${parent.email}`);
  });

  test("family page shows the agreement incl. medical/SEN, notes, history, owed and flag count", async ({ page }) => {
    const parent = await seedParent();
    cleanup.push(parent.id);
    const name = `Kid${parent.tag}`;
    const childId = await seedChild(parent.id, { firstName: name });
    await serviceClient().from("agreements").update({ medical_info: "Asthma\ninhaler in bag", sen_info: "Dyslexia" }).eq("child_id", childId);
    await seedBooking(parent.id, childId, { daysAhead: -4, status: "no_show", price: 2500, travel: 500 });
    await adminLogin(page, await createAdmin());

    await page.goto(`/admin/families/${parent.id}`);
    await expect(page.getByText("Gran Parent")).toBeVisible();
    await expect(page.getByText(/inhaler in bag/)).toBeVisible();
    await expect(page.getByText("Dyslexia")).toBeVisible();
    await expect(page.getByTestId("owed")).toHaveText("£30");
    await expect(page.getByTestId("flag-count")).toHaveText("1");

    await page.getByLabel(`Note about ${name}`).fill("Strong on bonding");
    await page.getByRole("button", { name: `Add note for ${name}` }).click();
    await expect(page.getByText("Strong on bonding")).toBeVisible();
    await expect(page.getByRole("list", { name: "Booking history" }).getByText("No-show")).toBeVisible();
  });

  test("tutor cancel with refund, and waive fee", async ({ page }) => {
    const parent = await seedParent();
    cleanup.push(parent.id);
    const childId = await seedChild(parent.id, { approved: true, firstName: `Kid${parent.tag}` });
    const paid = await seedBooking(parent.id, childId, { daysAhead: 9, payment: "paid", price: 2500 });
    const late = await seedBooking(parent.id, childId, { daysAhead: -6, status: "late_cancelled", price: 2500 });
    await adminLogin(page, await createAdmin());

    await openBookings(page, parent.tag);
    await bookingCard(page, paid.id).getByRole("button", { name: "Cancel booking" }).click();
    await page.getByRole("button", { name: "Cancel and refund" }).click();
    await expect(bookingCard(page, paid.id).getByText("Refunded", { exact: true })).toBeVisible();
    const ledger = await serviceClient().from("ledger").select("kind, amount_pence").eq("booking_id", paid.id);
    expect(ledger.data).toEqual([{ kind: "refund", amount_pence: 2500 }]);

    await bookingCard(page, late.id).getByRole("button", { name: "Waive fee" }).click();
    await expect(bookingCard(page, late.id).getByText("Waived", { exact: true })).toBeVisible();
  });

  test("blocks and bundles: pay a bundle, pay a block, release a block, with alerts for expired holds", async ({ page }) => {
    const parent = await seedParent();
    cleanup.push(parent.id);
    const name = `Kid${parent.tag}`;
    const childId = await seedChild(parent.id, { approved: true, firstName: name });
    const service = serviceClient();
    const bundle = randomUUID();
    const rows = [];
    for (const [i, hoursAgo] of [60, 36].entries()) {
      rows.push(
        await seedBooking(parent.id, childId, {
          daysAhead: 0,
          status: "attended",
          price: 1500,
          startsAt: () => new Date(Date.now() - hoursAgo * 3600_000 - randomInt(0, 400) * 5 * 60_000),
        }),
      );
      await service.from("bookings").update({ bundle_id: bundle, group_session_id: null }).eq("id", rows[i].id);
    }
    const mkBlock = async () => {
      const { data, error } = await service
        .from("block_bookings")
        .insert({
          parent_id: parent.id,
          child_id: childId,
          product: "saturday",
          weeks: 6,
          price_pence: 10200,
          status: "held",
          hold_expires_at: new Date(Date.now() - 3600_000).toISOString(),
        })
        .select("id, payment_reference")
        .single();
      if (error) throw error;
      return data as { id: string; payment_reference: string };
    };
    const payBlock = await mkBlock();
    const dropBlock = await mkBlock();
    const futureRow = await seedBooking(parent.id, childId, { daysAhead: 40, price: 1700 });
    await service.from("bookings").update({ block_booking_id: dropBlock.id }).eq("id", futureRow.id);
    await adminLogin(page, await createAdmin());

    await page.goto("/admin");
    const alerts = page.getByRole("region", { name: "Needs your attention" });
    await expect(alerts.getByRole("link", { name: new RegExp(`${parent.fullName}.*${payBlock.payment_reference}`) })).toBeVisible();
    await expect(alerts.getByRole("link", { name: parent.fullName, exact: true })).toBeVisible(); // unpaid past lessons

    await openBookings(page, parent.tag);
    await expect(page.getByText("Hold expired")).toHaveCount(2);
    await bookingCard(page, rows[1].id).getByRole("button", { name: "Mark bundle paid (bank transfer)" }).click();
    await expect(bookingCard(page, rows[0].id).getByText("Paid", { exact: true })).toBeVisible();
    await expect(bookingCard(page, rows[1].id).getByText("Paid", { exact: true })).toBeVisible();
    const bundleLedger = await service.from("ledger").select("amount_pence, booking_id").eq("parent_id", parent.id);
    expect(bundleLedger.data).toEqual([{ amount_pence: 3000, booking_id: rows[0].id }]);

    await page.getByRole("button", { name: new RegExp(`Mark block paid \\(cash\\) for .*${payBlock.payment_reference}`) }).click();
    await expect(page.getByText(payBlock.payment_reference)).toHaveCount(0);
    expect((await service.from("block_bookings").select("status").eq("id", payBlock.id).single()).data?.status).toBe("paid");

    await page.getByRole("button", { name: new RegExp(`Release block for .*${dropBlock.payment_reference}`) }).click();
    await page.getByRole("button", { name: "Yes, release it" }).click();
    await expect(page.getByText(dropBlock.payment_reference)).toHaveCount(0);
    const released = await service.from("bookings").select("status, cancelled_by").eq("id", futureRow.id).single();
    expect(released.data).toEqual({ status: "cancelled", cancelled_by: "tutor" });
  });

  test("Today lists today's lessons with time, child, kind, location and paid badge", async ({ page }) => {
    const parent = await seedParent();
    cleanup.push(parent.id);
    const name = `Kid${parent.tag}`;
    const childId = await seedChild(parent.id, { approved: true, firstName: name });
    const todayStart = () => {
      // A random 5-minute slot in the next 20 hours that is still London "today" and in the future.
      const d = new Date(Date.now() + randomInt(1, 20 * 12) * 5 * 60_000);
      return londonDateOf(d) === londonDateOf(new Date()) ? d : new Date(Date.now() + 5 * 60_000);
    };
    const b = await seedBooking(parent.id, childId, { daysAhead: 0, payment: "paid", startsAt: todayStart });
    await adminLogin(page, await createAdmin());
    const start = new Date((await serviceClient().from("bookings").select("starts_at").eq("id", b.id).single()).data!.starts_at);
    const sameDay = londonDateOf(start) === londonDateOf(new Date());
    test.skip(!sameDay, "booking fell after London midnight");
    const row = page.getByRole("region", { name: "Lessons" }).locator("li", { hasText: name });
    await expect(row).toContainText(formatLondon(start, "h:mmaaa"));
    await expect(row).toContainText("1-to-1");
    await expect(row).toContainText("Tutor's place");
    await expect(row.getByText("Paid", { exact: true })).toBeVisible();
  });

  test("manual booking skips slot rules but refuses overlaps", async ({ page }) => {
    const parent = await seedParent();
    cleanup.push(parent.id);
    const name = `Kid${parent.tag}`;
    await seedChild(parent.id, { firstName: name });
    await adminLogin(page, await createAdmin());
    const day = new Date(Date.now() + (200 + randomInt(0, 300)) * DAY);
    const date = londonDateOf(day);

    await page.goto(`/admin/families/${parent.id}`);
    await page.getByText(`Add a booking by hand for ${name}`).click();
    const form = page.getByRole("form", { name: `Add a booking for ${name}` });
    await form.getByLabel("Date").fill(date);
    await form.getByLabel("Time").fill("06:00");
    await form.getByLabel("Where").selectOption("online");
    await form.getByRole("button", { name: "Add booking" }).click();
    await expect(page.getByText("Booking added.")).toBeVisible();
    await expect(page.getByRole("list", { name: "Booking history" }).getByText("Confirmed", { exact: true })).toBeVisible();

    await form.getByLabel("Time").fill("06:30");
    await form.getByRole("button", { name: "Add booking" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "That time overlaps another booking." })).toBeVisible();
  });

  test("admin pages have no axe violations", async ({ page }) => {
    test.setTimeout(120_000); // eight pages, each compiled on first visit by the dev server
    const service = serviceClient();
    await page.emulateMedia({ reducedMotion: "reduce" });
    const parent = await seedParent();
    cleanup.push(parent.id);
    const name = `Kid${parent.tag}`;
    const childId = await seedChild(parent.id, { firstName: name });
    await seedBooking(parent.id, childId, { daysAhead: -2, status: "no_show" });
    await seedBooking(parent.id, childId, { daysAhead: 4, status: "pending", location: "home_visit", address: "1 Road", travel: 500 });
    await service.from("block_bookings").insert({
      parent_id: parent.id,
      child_id: childId,
      product: "saturday",
      weeks: 6,
      price_pence: 10200,
      status: "held",
      hold_expires_at: new Date(Date.now() - 3600_000).toISOString(),
    });
    await adminLogin(page, await createAdmin());
    const filters = ["upcoming", "todo", "unpaid", "past"].map((f) => `/admin/bookings?filter=${f}&q=${parent.tag}`);
    for (const url of ["/admin", ...filters, `/admin/bookings?filter=all&q=${parent.tag}`, `/admin/families?q=${parent.tag}`, `/admin/families/${parent.id}`]) {
      await page.goto(url);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(results.violations, url).toEqual([]);
    }
  });
});
