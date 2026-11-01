import { expect, test } from "@playwright/test";
import { randomInt } from "node:crypto";
import { createParent, deleteBookingsFor, seedChild, serviceClient, type Parent } from "./helpers";

let parent: Parent | undefined;

test.afterEach(async () => {
  if (parent) await deleteBookingsFor(parent.id);
  parent = undefined;
});

/** Inserts an online one-to-one for `parent` starting `minutesAhead` from now (up to ~33h of random jitter avoids clashes between parallel projects). */
async function seedBooking(
  childId: string,
  opts: { minutesAhead: number; status?: string; paymentStatus?: string; price?: number; bookedDaysAgo?: number },
) {
  for (let attempt = 0; ; attempt++) {
    const start = new Date(Date.now() + (opts.minutesAhead + randomInt(0, 400) * 5) * 60_000);
    start.setSeconds(0, 0);
    const end = new Date(start.getTime() + 3600_000);
    const { data, error } = await serviceClient()
      .from("bookings")
      .insert({
        parent_id: parent!.id,
        child_id: childId,
        kind: "one_to_one",
        location: "online",
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        busy_until: end.toISOString(),
        status: opts.status ?? "confirmed",
        payment_status: opts.paymentStatus ?? "unpaid",
        price_pence: opts.price ?? 3000,
        // When the booking was made: the 14-day cooling-off counts from here (Ruling R20).
        created_at: new Date(Date.now() - (opts.bookedDaysAgo ?? 0) * 86_400_000).toISOString(),
      })
      .select("id, payment_reference")
      .single();
    // Another parallel test holds that hour (no-overlap constraint): pick another.
    if (error?.code === "23P01" && attempt < 10) continue;
    if (error) throw error;
    return data as { id: string; payment_reference: string };
  }
}

async function row(id: string) {
  const { data, error } = await serviceClient()
    .from("bookings")
    .select("status, payment_status, cancelled_at, cancelled_by")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

test.describe("dashboard", () => {
  test("free cancellation 3 days ahead", async ({ page }) => {
    parent = await createParent(page);
    const child = await seedChild(parent.id, { approved: true });
    const b = await seedBooking(child, { minutesAhead: 3 * 24 * 60 + 24 * 60, paymentStatus: "paid" });

    await page.goto("/account/bookings");
    await page.getByRole("button", { name: "Cancel booking" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/late cancellation fee/i)).toHaveCount(0);
    await dialog.getByRole("button", { name: "Yes, cancel booking" }).click();
    await expect(page.getByText("Booking cancelled.")).toBeVisible();

    const after = await row(b.id);
    expect(after.status).toBe("cancelled");
    expect(after.payment_status).toBe("credited");
    expect(after.cancelled_by).toBe("parent");
    expect(after.cancelled_at).not.toBeNull();

    // The payment became family credit (Ruling R23): a ledger credit, shown on the account page.
    const { data: credit } = await serviceClient().from("ledger").select("kind, amount_pence").eq("booking_id", b.id);
    expect(credit).toEqual([{ kind: "credit", amount_pence: 3000 }]);
    await page.goto("/account");
    await expect(page.getByTestId("credit")).toHaveText("You have £30 credit — the tutor will apply it to a future lesson.");
    const creditTip = page.getByRole("button", { name: "More about credit" });
    await creditTip.click();
    await expect(page.locator(`#${await creditTip.getAttribute("aria-controls")}`)).toContainText(/refund it to your card/);
    await page.goto("/account/bookings");
    await expect(page.getByText("Credited", { exact: true })).toBeVisible();
  });

  test("late cancellation shows fee dialog and records late_cancelled", async ({ page }) => {
    parent = await createParent(page);
    const child = await seedChild(parent.id, { approved: true });
    const b = await seedBooking(child, { minutesAhead: 6 * 60, price: 3000, bookedDaysAgo: 20 });

    await page.goto("/account");
    await page.getByRole("button", { name: "Cancel booking" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("A late cancellation fee of £15 will be due")).toBeVisible();
    await dialog.getByRole("button", { name: "Yes, cancel and pay the fee" }).click();
    await expect(page.getByText(/Booking cancelled\. A late cancellation fee of £15/)).toBeVisible();

    const after = await row(b.id);
    expect(after.status).toBe("late_cancelled");
    expect(after.payment_status).toBe("unpaid");
    expect(after.cancelled_by).toBe("parent");
    await page.reload();
    await expect(page.getByTestId("owed")).toHaveText("£15");
  });

  test("inside 48 hours but within 14 days of booking: free, with the cooling-off message", async ({ page }) => {
    parent = await createParent(page);
    const child = await seedChild(parent.id, { approved: true });
    const b = await seedBooking(child, { minutesAhead: 6 * 60, price: 3000, paymentStatus: "paid", bookedDaysAgo: 3 });

    await page.goto("/account/bookings");
    await page.getByRole("button", { name: "Cancel booking" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("You're within your 14-day cooling-off period, so there's no charge.")).toBeVisible();
    await expect(dialog.getByText(/late cancellation fee/i)).toHaveCount(0);
    await dialog.getByRole("button", { name: "Yes, cancel booking" }).click();
    await expect(page.getByText("Booking cancelled.")).toBeVisible();

    const after = await row(b.id);
    expect(after.status).toBe("cancelled");
    expect(after.payment_status).toBe("credited");
  });

  test("owed balance blocks new booking with money_owed message", async ({ page }) => {
    parent = await createParent(page);
    const child = await seedChild(parent.id, { approved: true });
    const b = await seedBooking(child, { minutesAhead: -3 * 24 * 60, status: "attended", price: 2500 });

    await page.goto("/account");
    await expect(page.getByTestId("owed")).toHaveText("£25");
    await expect(page.getByText(b.payment_reference).first()).toBeVisible();

    await page.goto("/account/book");
    await page.getByRole("button", { name: /^Sam Parent/ }).click();
    await expect(page.getByText("You have an unpaid balance. Please pay it before booking again.")).toBeVisible();
  });

  test("shows each child's agreement and approval status; blocked parent sees contact message", async ({ page }) => {
    parent = await createParent(page);
    await seedChild(parent.id, { firstName: "Ava", approved: false });
    await seedChild(parent.id, { firstName: "Ben", approved: true });
    await page.goto("/account");
    await expect(page.getByRole("link", { name: "Book a lesson" })).toBeVisible();
    await expect(page.getByText("Awaiting assessment")).toBeVisible();
    await expect(page.getByText("Approved", { exact: true })).toBeVisible();

    const blocked = await serviceClient()
      .from("profiles")
      .update({ is_blocked: true, blocked_reason: "secret internal reason" })
      .eq("id", parent.id);
    if (blocked.error) throw blocked.error;
    await page.reload();
    await expect(page.getByText("Please contact Study Lab Co.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Book a lesson" })).toHaveCount(0);
    await expect(page.getByText("secret internal reason")).toHaveCount(0);
  });

  test("marketing opt-in toggles", async ({ page }) => {
    parent = await createParent(page);
    await page.goto("/account/settings");
    const box = page.getByLabel(/send me/i);
    await expect(box).not.toBeChecked();
    await box.check();
    await page.getByRole("button", { name: "Save preference" }).click();
    await expect(page.getByText("Preference saved.")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel(/send me/i)).toBeChecked();
    const db = serviceClient();
    const profile = await db.from("profiles").select("marketing_opt_in").eq("id", parent.id).single();
    expect(profile.data?.marketing_opt_in).toBe(true);
    const consents = await db
      .from("consents")
      .select("granted, policy_version, created_at")
      .eq("profile_id", parent.id)
      .eq("kind", "marketing")
      .order("created_at");
    expect(consents.data?.at(-1)).toMatchObject({ granted: true, policy_version: "2026-11-01" });

    await page.getByLabel(/send me/i).uncheck();
    await page.getByRole("button", { name: "Save preference" }).click();
    await expect(page.getByText("Preference saved.")).toBeVisible();
    const off = await db.from("profiles").select("marketing_opt_in").eq("id", parent.id).single();
    expect(off.data?.marketing_opt_in).toBe(false);
  });

  test("delete account refuses while money owed, then deletes and signs out", async ({ page }) => {
    parent = await createParent(page);
    const child = await seedChild(parent.id, { approved: true });
    const b = await seedBooking(child, { minutesAhead: -2 * 24 * 60, status: "attended", price: 2500 });
    await page.goto("/account/settings");
    await page.getByRole("button", { name: "Delete my account" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Yes, delete my account" }).click();
    await expect(page.getByRole("dialog").getByText(/You still owe £25/)).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).first().click();

    const paid = await serviceClient().from("bookings").update({ payment_status: "paid" }).eq("id", b.id);
    if (paid.error) throw paid.error;
    await page.getByRole("button", { name: "Delete my account" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Yes, delete my account" }).click();
    await expect(page).toHaveURL(/\/\?notice=account-deleted/);
    await expect(page.getByText("Your account has been deleted.")).toBeVisible();

    const gone = await serviceClient().from("profiles").select("id").eq("id", parent.id);
    expect(gone.data).toEqual([]);
    const kept = await serviceClient().from("bookings").select("parent_id, price_pence").eq("id", b.id).single();
    expect(kept.data).toEqual({ parent_id: null, price_pence: 2500 });
    await serviceClient().from("bookings").delete().eq("id", b.id);
    parent = undefined;
  });
});
