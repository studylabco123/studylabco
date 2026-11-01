import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { londonDateOf } from "../../src/lib/time";
import { createAdmin, createParent, deleteBookingsFor, login, seedChild, serviceClient, setBankDetails, totpCode, type Admin } from "./helpers";

/**
 * Admin calendar, groups, settings, calendar feed and backup. These tests
 * change shared state (closed days, the online switch, prices, the feed
 * token), so Playwright runs this file in its own "config" project, after the
 * parent-facing specs, and each test puts things back.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const DAY = 86_400_000;
const service = serviceClient();
const unique = () => randomUUID().slice(0, 6);

let admin: Admin;
test.beforeAll(async () => {
  admin = await createAdmin();
  await setBankDetails();
});

async function adminLogin(page: Page) {
  await login(page, admin.email, admin.password);
  await expect(page).toHaveURL(/\/admin\/mfa$/, { timeout: 20_000 });
  await page.getByLabel("6-digit code").fill(totpCode(admin.totpSecret));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible({ timeout: 20_000 });
}

/** A second, signed-in parent browser with a fresh child, at the booking wizard. */
async function parentWizard(browser: Browser, opts: { firstName?: string; approved?: boolean } = {}) {
  const context = await browser.newContext({ baseURL: "http://localhost:3000" });
  const page = await context.newPage();
  const parent = await createParent(page);
  const firstName = opts.firstName ?? "Sam";
  await seedChild(parent.id, { firstName, approved: opts.approved });
  return { context, page, parent, firstName };
}

async function toAssessmentLocations(page: Page, firstName: string, lesson: RegExp = /^Assessment Lesson/) {
  await page.goto("/account/book");
  await page.getByRole("button", { name: new RegExp(`^${firstName} Parent`) }).click();
  await page.getByRole("button", { name: lesson }).click();
}

/** London dates the wizard offers for an assessment at the tutor's place. */
async function offeredDates(page: Page, firstName: string): Promise<string[]> {
  await toAssessmentLocations(page, firstName);
  await page.getByRole("button", { name: /^At the tutor's place/ }).click();
  await expect(page.locator("[data-slot]").first()).toBeVisible();
  const slots = await page.locator("[data-slot]").evaluateAll((els) => els.map((e) => e.getAttribute("data-slot")!));
  return [...new Set(slots.map((s) => londonDateOf(new Date(s))))];
}

test.describe("calendar", () => {
  let closedDate: string | undefined;
  test.afterEach(async () => {
    if (closedDate) {
      const { error } = await service.from("blocked_times").delete().eq("reason", "Closed").gte("starts_at", new Date(Date.now() - DAY).toISOString());
      if (error) throw error;
    }
    closedDate = undefined;
  });

  test("close day removes all parent slots that day; reopen restores", async ({ page, browser }) => {
    const { context, page: parentPage, parent, firstName } = await parentWizard(browser);
    try {
      const before = await offeredDates(parentPage, firstName);
      expect(before.length).toBeGreaterThan(3);
      // The far end of the booking window: other specs pick near the front.
      const target = before[before.length - 1];
      closedDate = target;

      await adminLogin(page);
      await page.goto(`/admin/calendar?view=week&date=${target}`);
      const heading = new Date(`${target}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
      await page.getByRole("button", { name: `Close this day, ${heading}` }).click();
      await expect(page.getByRole("button", { name: `Reopen this day, ${heading}` })).toBeVisible();

      const during = await offeredDates(parentPage, firstName);
      expect(during).not.toContain(target);
      expect(during.length).toBe(before.length - 1);

      await page.getByRole("button", { name: `Reopen this day, ${heading}` }).click();
      await expect(page.getByRole("button", { name: `Close this day, ${heading}` })).toBeVisible();
      expect(await offeredDates(parentPage, firstName)).toContain(target);
    } finally {
      await deleteBookingsFor(parent.id);
      await context.close();
    }
  });

  test("inset days are tagged and the week and month views are labelled in words", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/calendar?view=week&date=2027-01-04");
    await expect(page.getByRole("article", { name: "Monday 4 January" }).getByText("Inset day")).toBeVisible();
    await page.goto("/admin/calendar?view=week&date=2026-12-25");
    const christmas = page.getByRole("article", { name: "Friday 25 December" });
    await expect(christmas.getByText("Closed", { exact: true }).first()).toBeVisible();
    await expect(christmas.getByText("Closed all day (default closure)")).toBeVisible();

    await page.goto("/admin/calendar?view=month&date=2026-09-15");
    await expect(page.getByRole("heading", { name: "September 2026" })).toBeVisible();
    await expect(page.getByText("Inset day").first()).toBeVisible();
    const axe = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(axe.violations).toEqual([]);
  });

  test("blocking a stretch of time and removing it", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/calendar");
    const reason = `Dentist ${unique()}`;
    const day = londonDateOf(new Date(Date.now() + 40 * DAY));
    await page.getByLabel("From (UK time)").first().fill(`${day}T14:00`);
    await page.getByLabel("Until (UK time)").first().fill(`${day}T15:00`);
    await page.getByLabel("Reason (optional)").first().fill(reason);
    await page.getByRole("button", { name: "Block this time" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Blocked." })).toBeVisible();
    const rows = await service.from("blocked_times").select("id").eq("reason", reason);
    expect(rows.data).toHaveLength(1);

    await page.goto(`/admin/calendar?view=week&date=${day}`);
    await page.getByRole("button", { name: new RegExp(`^Remove block, Blocked: ${reason}`) }).click();
    await expect(page.getByText(reason)).toHaveCount(0);
    expect((await service.from("blocked_times").select("id").eq("reason", reason)).data).toHaveLength(0);
  });
});

test.describe("groups", () => {
  const titles: string[] = [];
  test.afterEach(async () => {
    for (const t of titles.splice(0)) {
      await service.from("bookings").delete().in("group_session_id", ((await service.from("group_sessions").select("id").like("title", `${t}%`)).data ?? []).map((s) => s.id));
      await service.from("group_sessions").delete().like("title", `${t}%`);
      await service.from("group_series").delete().like("title", `${t}%`);
    }
  });

  test("new weekly group appears on /groups with 15 seats left", async ({ page }) => {
    const title = `E2E Weekly ${unique()}`;
    titles.push(title);
    await adminLogin(page);
    await page.goto("/admin/groups");
    const form = page.getByRole("region", { name: "Add a weekly group" });
    await form.getByLabel("Title").fill(title);
    await form.getByLabel("First date").fill(londonDateOf(new Date(Date.now() + 2 * DAY)));
    await form.getByLabel("Start time (UK time)").fill("06:30");
    await form.getByLabel("Level").selectOption("KS3");
    await form.getByRole("button", { name: "Add weekly group" }).click();
    await expect(form.getByRole("status")).toHaveText("Group added.");

    await page.goto("/admin/groups");
    await expect(page.getByRole("listitem").filter({ hasText: title }).filter({ hasText: "15 seats left" }).first()).toBeVisible();
    const { data } = await service.from("group_sessions").select("capacity, level").like("title", `${title}%`);
    expect((data ?? []).length).toBeGreaterThanOrEqual(11);
    expect(data?.every((s) => s.capacity === 15 && s.level === "KS3")).toBe(true);
    await expect(page.getByRole("listitem").filter({ hasText: title }).first()).toContainText("KS3");
    const axe = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(axe.violations).toEqual([]);

    // And on the public Group Sessions page (Task 14 deferred assertion).
    await page.goto("/groups");
    await expect(
      page.getByRole("list", { name: "Upcoming group sessions" }).getByRole("listitem").filter({ hasText: title }).filter({ hasText: "15 seats left" }).first(),
    ).toBeVisible();
  });

  test("cancel group session emails booked families and frees seats", async ({ page }) => {
    const title = `E2E Cancel ${unique()}`;
    titles.push(title);
    const start = new Date(Date.now() + 5 * DAY);
    start.setSeconds(0, 0);
    const session = await service
      .from("group_sessions")
      .insert({ title, starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 3600_000).toISOString(), capacity: 15, price_pence: 1800 })
      .select("id")
      .single();
    if (session.error) throw session.error;

    const families: { id: string; email: string; booking: string }[] = [];
    for (const paid of [true, false]) {
      const email = `grp-${unique()}-${unique()}@example.test`;
      const u = await service.auth.admin.createUser({ email, password: "correct-horse-battery", email_confirm: true, user_metadata: { full_name: "Gwen Group" } });
      if (u.error) throw u.error;
      const child = await seedChild(u.data.user.id, { firstName: "Gus" });
      const b = await service
        .from("bookings")
        .insert({
          parent_id: u.data.user.id,
          child_id: child,
          kind: "group",
          location: "group_venue",
          starts_at: start.toISOString(),
          ends_at: new Date(start.getTime() + 3600_000).toISOString(),
          busy_until: new Date(start.getTime() + 3600_000).toISOString(),
          group_session_id: session.data.id,
          status: "confirmed",
          payment_status: paid ? "paid" : "unpaid",
          price_pence: 1800,
        })
        .select("id")
        .single();
      if (b.error) throw b.error;
      families.push({ id: u.data.user.id, email, booking: b.data.id });
    }
    expect((await service.rpc("seats_left", { p_session: session.data.id })).data).toBe(13);

    await adminLogin(page);
    await page.goto("/admin/groups");
    await page.getByRole("button", { name: new RegExp(`^Cancel session, ${title}`) }).click();
    await page.getByRole("button", { name: "Cancel and refund any payments" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: title }).getByText("Cancelled", { exact: true })).toBeVisible();

    const bookings = await service.from("bookings").select("id, status, payment_status, cancelled_by").in("id", families.map((f) => f.booking));
    expect(bookings.data?.map((b) => b.status)).toEqual(["cancelled", "cancelled"]);
    expect(bookings.data?.find((b) => b.id === families[0].booking)?.payment_status).toBe("refunded");
    expect(bookings.data?.find((b) => b.id === families[1].booking)?.payment_status).toBe("unpaid");
    const ledger = await service.from("ledger").select("kind, amount_pence, occurred_on").eq("booking_id", families[0].booking);
    expect(ledger.data).toEqual([{ kind: "refund", amount_pence: 1800, occurred_on: londonDateOf(new Date()) }]);
    const mails = await service.from("email_log").select("booking_id, to_email").eq("template", "group_cancelled").in("booking_id", families.map((f) => f.booking));
    expect(mails.data?.map((m) => m.to_email).sort()).toEqual(families.map((f) => f.email).sort());
    expect((await service.rpc("seats_left", { p_session: session.data.id })).data).toBe(15);

    for (const f of families) await service.auth.admin.deleteUser(f.id);
  });
});

test.describe("settings", () => {
  let original: { online_enabled: boolean; price_assessment_pence: number } | undefined;
  test.beforeEach(async () => {
    original = (await service.from("settings").select("online_enabled, price_assessment_pence").single()).data ?? undefined;
  });
  test.afterEach(async () => {
    if (original) await service.from("settings").update(original).eq("id", 1);
  });

  test("turning online on makes online appear in booking wizard; off hides it", async ({ page, browser }) => {
    const { context, page: parentPage, parent, firstName } = await parentWizard(browser, { approved: true });
    // Online is offered for 1-to-1 lessons (an approved child), not for the first assessment.
    const oneToOne = /^1-to-1 lesson/;
    try {
      await service.from("settings").update({ online_enabled: false }).eq("id", 1);
      await toAssessmentLocations(parentPage, firstName, oneToOne);
      await expect(parentPage.getByRole("button", { name: /^At the tutor's place/ })).toBeVisible();
      await expect(parentPage.getByRole("button", { name: /^Online/ })).toHaveCount(0);

      await adminLogin(page);
      await page.goto("/admin/settings");
      const online = page.getByRole("checkbox", { name: "Online", exact: true });
      await expect(online).not.toBeChecked();
      await online.check();
      await page.getByRole("button", { name: "Save settings" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Settings saved." })).toBeVisible();
      await toAssessmentLocations(parentPage, firstName, oneToOne);
      await expect(parentPage.getByRole("button", { name: /^Online/ })).toBeVisible();

      await page.goto("/admin/settings");
      await expect(online).toBeChecked();
      await online.uncheck();
      await page.getByRole("button", { name: "Save settings" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Settings saved." })).toBeVisible();
      await toAssessmentLocations(parentPage, firstName, oneToOne);
      await expect(parentPage.getByRole("button", { name: /^At the tutor's place/ })).toBeVisible();
      await expect(parentPage.getByRole("button", { name: /^Online/ })).toHaveCount(0);
    } finally {
      await deleteBookingsFor(parent.id);
      await context.close();
    }
  });

  test("price change applies to new bookings only", async ({ page, browser }) => {
    // An existing £10 assessment, made before the change.
    const first = await parentWizard(browser, { firstName: "Old" });
    const start = new Date(Date.now() + 9 * DAY);
    start.setSeconds(0, 0);
    const old = await service
      .from("bookings")
      .insert({
        parent_id: first.parent.id,
        child_id: (await service.from("children").select("id").eq("parent_id", first.parent.id).single()).data!.id,
        kind: "assessment",
        location: "tutor_place",
        starts_at: start.toISOString(),
        ends_at: new Date(start.getTime() + 3600_000).toISOString(),
        busy_until: new Date(start.getTime() + 3600_000).toISOString(),
        status: "confirmed",
        price_pence: 1000,
      })
      .select("id")
      .single();
    if (old.error) throw old.error;
    const second = await parentWizard(browser, { firstName: "New" });
    try {
      await adminLogin(page);
      await page.goto("/admin/settings");
      await page.getByLabel("Assessment Lesson (£)").fill("12.50");
      await page.getByRole("button", { name: "Save settings" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Settings saved." })).toBeVisible();

      await toAssessmentLocations(second.page, "New");
      await second.page.getByRole("button", { name: /^At the tutor's place/ }).click();
      const slots = second.page.locator("[data-slot]");
      await expect(slots.first()).toBeVisible();
      await slots.nth(Math.min(5, (await slots.count()) - 1)).click();
      await expect(second.page.getByTestId("total")).toHaveText("£12.50");
      await second.page.getByLabel(/I want lessons to start within 14 days/).check();
      await second.page.getByRole("button", { name: "Confirm booking" }).click();
      await expect(second.page).toHaveURL(/\/account\/bookings\/[0-9a-f-]{36}$/);
      await expect(second.page.getByTestId("booking-total")).toHaveText("£12.50");

      expect((await service.from("bookings").select("price_pence").eq("id", old.data.id).single()).data?.price_pence).toBe(1000);
      await first.page.goto(`/account/bookings/${old.data.id}`);
      await expect(first.page.getByTestId("booking-total")).toHaveText("£10");
      expect((await service.from("bookings").select("price_pence").eq("parent_id", second.parent.id).single()).data?.price_pence).toBe(1250);
    } finally {
      await deleteBookingsFor(first.parent.id);
      await deleteBookingsFor(second.parent.id);
      await first.context.close();
      await second.context.close();
    }
  });

  test("changing group price in settings changes /lessons", async ({ page }) => {
    const before = (await service.from("settings").select("price_group_pence").single()).data!.price_group_pence as number;
    try {
      await page.goto("/lessons");
      await expect(page.getByTestId("price-group")).toHaveText("£18");
      await service.from("settings").update({ price_group_pence: 1950 }).eq("id", 1);
      await page.goto("/lessons");
      await expect(page.getByTestId("price-group")).toHaveText("£19.50");
      await page.goto("/");
      await expect(page.locator("main").getByText("£19.50").first()).toBeVisible();
    } finally {
      await service.from("settings").update({ price_group_pence: before }).eq("id", 1);
    }
  });

  test("the owner's name set in Settings shows in the footer and on Contact; empty hides it (R24)", async ({ page }) => {
    // The seed names the owner (Abdullah Chopdat); start from "not set", and restore it afterwards.
    const seeded = (await service.from("settings").select("owner_name").single()).data?.owner_name ?? null;
    await service.from("settings").update({ owner_name: null }).eq("id", 1);
    try {
      await page.goto("/contact");
      await expect(page.getByTestId("owner-line")).toHaveCount(0);
      await adminLogin(page);
      await page.goto("/admin/settings");
      await page.getByLabel("Your name (shown on the website)").fill("x".repeat(81));
      await page.getByRole("button", { name: "Save settings" }).click();
      await expect(page.getByText("The owner's name is too long (80 characters at most).")).toBeVisible();
      await page.getByLabel("Your name (shown on the website)").fill("Jane Smith");
      await page.getByRole("button", { name: "Save settings" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Settings saved." })).toBeVisible();
      await page.goto("/contact");
      await expect(page.locator("main").getByTestId("owner-line")).toHaveText("Study Lab Co is run by Jane Smith.");
      await expect(page.locator("footer").getByTestId("owner-line")).toHaveText("Study Lab Co is run by Jane Smith.");
    } finally {
      await service.from("settings").update({ owner_name: null }).eq("id", 1);
    }
    await page.goto("/contact");
    await expect(page.getByTestId("owner-line")).toHaveCount(0);
    await service.from("settings").update({ owner_name: seeded }).eq("id", 1);
  });

  test("a bad sort code is refused with a message and nothing is saved", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/settings");
    await page.getByLabel("Sort code", { exact: true }).fill("12-34");
    await page.getByLabel("Account number", { exact: true }).fill("1234");
    await page.getByLabel("Group session (£)").fill("19");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("A sort code is six digits, like 12-34-56.")).toBeVisible();
    await expect(page.getByText("An account number is eight digits.")).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "Some settings need fixing" })).toBeVisible();
    expect((await service.from("settings").select("price_group_pence").single()).data?.price_group_pence).not.toBe(1900);
  });

  test("the settings page has every section and no axe violations", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/settings");
    for (const name of ["Prices", "Pass prices", "Where lessons can happen", "Booking rules", "Business details", "Bank and teaching details", "Calendar link", "Backup"]) {
      await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    }
    for (const toggle of ["Tutor's place", "Home visits", "Online"]) await expect(page.getByRole("checkbox", { name: toggle, exact: true })).toBeVisible();
    // Every settings field has an "i" button with a short explanation.
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Save settings" }) });
    const fields = await form.locator("input:not([type=hidden]), textarea").count();
    await expect(form.getByRole("button", { name: /^More about / })).toHaveCount(fields);
    const tip = form.getByRole("button", { name: "More about Late cancellation fee (% of the lesson price)" });
    await tip.click();
    await expect(form.getByText(/share of the lesson price owed for a late cancellation/)).toBeVisible();
    const axe = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(axe.violations).toEqual([]);
  });
});

test.describe("calendar feed and backup", () => {
  let originalToken: string | undefined;
  test.afterEach(async () => {
    if (originalToken) await service.from("settings_private").update({ calendar_feed_token: originalToken }).eq("id", 1);
    originalToken = undefined;
  });

  test("wrong token → 404; the right token serves a calendar", async ({ request }) => {
    const token = (await service.from("settings_private").select("calendar_feed_token").single()).data!.calendar_feed_token as string;
    for (const bad of ["wrong", "x".repeat(token.length), token.slice(0, -1), `${token}0`]) {
      const res = await request.get(`/api/calendar/${bad}`);
      expect(res.status(), bad).toBe(404);
    }
    const ok = await request.get(`/api/calendar/${token}`);
    expect(ok.status()).toBe(200);
    expect(ok.headers()["content-type"]).toContain("text/calendar");
    const body = await ok.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).not.toMatch(/medical|sen_info|home_address/i);
  });

  test("regenerating the link kills the old one", async ({ page, request }) => {
    originalToken = (await service.from("settings_private").select("calendar_feed_token").single()).data!.calendar_feed_token as string;
    await adminLogin(page);
    await page.goto("/admin/settings");
    await expect(page.getByTestId("feed-url")).toHaveText(`http://localhost:3000/api/calendar/${originalToken}`);
    await page.getByRole("button", { name: "Regenerate link" }).click();
    await page.getByRole("button", { name: "Yes, regenerate it" }).click();
    await expect(page.getByTestId("feed-url")).not.toHaveText(new RegExp(originalToken));
    const fresh = (await page.getByTestId("feed-url").textContent())!.split("/").pop()!;
    expect(fresh).toMatch(/^[0-9a-f]{48}$/);
    expect((await request.get(`/api/calendar/${originalToken}`)).status()).toBe(404);
    expect((await request.get(`/api/calendar/${fresh}`)).status()).toBe(200);
  });

  test("backup downloads as JSON for the admin and not for anyone else", async ({ page, request }) => {
    const anon = await request.get("/api/admin/backup", { maxRedirects: 0 });
    expect(anon.status()).toBeGreaterThanOrEqual(300);
    expect(anon.status()).toBeLessThan(400);
    expect(anon.headers()["content-type"] ?? "").not.toContain("json");

    await adminLogin(page);
    const res = await page.request.get("/api/admin/backup");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-disposition"]).toBe(`attachment; filename="studylabco-backup-${londonDateOf(new Date())}.json"`);
    expect(res.headers()["cache-control"]).toBe("no-store");
    const json = (await res.json()) as { tables: Record<string, unknown[]> };
    for (const t of ["profiles", "bookings", "settings", "settings_private", "group_series", "ledger"]) expect(json.tables[t], t).toBeDefined();
    expect(json.tables.settings).toHaveLength(1);
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });

  test("calendar, groups and settings fit the screen", async ({ page }) => {
    await adminLogin(page);
    for (const path of ["/admin/calendar", "/admin/calendar?view=month", "/admin/groups", "/admin/settings"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});

