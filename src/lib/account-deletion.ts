import "server-only";
import { formatPence } from "@/lib/format";
import { mapBooking, type BookingRow } from "@/lib/supabase/mappers";
import { createServiceClient } from "@/lib/supabase/service";
import { amountOwedPence, creditBalancePence } from "@/lib/booking/owed";
import { passRemaining } from "@/lib/booking/pass";
import { mapLedger, mapPass, type LedgerRow, type PassRow } from "@/lib/supabase/mappers";
import { getSettings } from "@/lib/settings";

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; reason: "money_owed"; owedPence: number; message: string }
  | { ok: false; reason: "lesson_soon" | "not_a_parent" | "has_credit_or_pass"; message: string }
  | { ok: false; reason: "error"; message: string };

/**
 * Deletes a parent's account (service client; the caller passes the id of the
 * signed-in user, never a client-supplied id).
 *
 * Refuses for non-parent profiles (R13), while money is owed, and while a
 * pending/confirmed lesson starts inside the cancellation notice window (R12).
 * Otherwise, in this order: cancel every future pending/confirmed booking (free,
 * so slots and seats are released; a group-pass seat just goes back on the pass; a future paid lesson not on a pass refuses deletion first),
 * delete email_log rows and free-text notes tied to the parent's bookings and passes, detach bookings
 * (parent, child, home address and postcode set to null; price, travel fee,
 * status, dates and the ledger are kept), delete consents, delete children
 * (cascades agreements, notes, student status and test results; result files are removed from storage first), and finally delete the auth
 * user (cascades the profile; ledger and pass rows keep their amounts with a
 * null parent). The auth user goes last so a failure part-way leaves an account
 * that can still log in and retry, never a half-deleted one that cannot. Every
 * step is safe to repeat. On any failure we stop and report.
 */
export async function deleteAccount(parentId: string, opts: { now?: Date } = {}): Promise<DeleteAccountResult> {
  const now = opts.now ?? new Date();
  const c = createServiceClient();
  const failed = (what: string, error: { message: string }): DeleteAccountResult => {
    console.error(`deleteAccount: ${what}`, error);
    return {
      ok: false,
      reason: "error",
      message: "We could not delete your account. Some steps may already have been done, so please try again or contact Study Lab Co.",
    };
  };

  const profile = await c.from("profiles").select("role, email").eq("id", parentId).maybeSingle();
  if (profile.error) return failed("load profile", profile.error);
  if (profile.data?.role !== "parent") {
    return { ok: false, reason: "not_a_parent", message: "This account cannot be deleted here. Please contact Study Lab Co." };
  }

  const bookings = await c.from("bookings").select("*").eq("parent_id", parentId);
  if (bookings.error) return failed("load bookings", bookings.error);
  const settings = await getSettings();
  const owedPence = amountOwedPence((bookings.data as BookingRow[]).map(mapBooking), [], now, settings.lateFeePercent);
  if (owedPence > 0) {
    return {
      ok: false,
      reason: "money_owed",
      owedPence,
      message: `You still owe ${formatPence(owedPence)}. We keep a record of what is owed, so please pay your balance before deleting your account.`,
    };
  }

  // Credit and unused group-pass sessions are money the family is owed (V6): the tutor settles them first.
  const [creditRows, passRows] = await Promise.all([
    c.from("ledger").select("*").eq("parent_id", parentId).in("kind", ["credit", "credit_applied"]),
    c.from("passes").select("*").eq("parent_id", parentId).eq("status", "active"),
  ]);
  if (creditRows.error) return failed("load credit", creditRows.error);
  if (passRows.error) return failed("load passes", passRows.error);
  const creditPence = creditBalancePence((creditRows.data as LedgerRow[]).map(mapLedger), parentId);
  const activePasses = (passRows.data as PassRow[]).map(mapPass);
  let unusedSessions = false;
  if (activePasses.length) {
    const seats = await c.from("bookings").select("id, status, pass_id, starts_at").in("pass_id", activePasses.map((p) => p.id));
    if (seats.error) return failed("load pass sessions", seats.error);
    const lite = (seats.data as { id: string; status: never; pass_id: string; starts_at: string }[]).map((r) => ({
      id: r.id,
      status: r.status,
      passId: r.pass_id,
      startsAt: new Date(r.starts_at),
    }));
    // Deletion would cancel future booked seats back onto the pass, so they still count as unused.
    const consumed = lite.filter((r) => !((r.status === "pending" || r.status === "confirmed") && r.startsAt > now));
    unusedSessions = activePasses.some((p) => passRemaining(p, consumed) > 0);
  }
  if (creditPence > 0 || unusedSessions) {
    return {
      ok: false,
      reason: "has_credit_or_pass",
      message: `You have ${formatPence(creditPence)} credit or unused group-pass sessions. Please contact Study Lab Co before deleting your account.`,
    };
  }
  const soon = now.getTime() + settings.cancellationNoticeHours * 3600_000;
  const mine = (bookings.data as BookingRow[]).map(mapBooking);
  if (
    mine.some(
      (b) => (b.status === "pending" || b.status === "confirmed") && b.startsAt > now && b.startsAt.getTime() < soon,
    )
  ) {
    return {
      ok: false,
      reason: "lesson_soon",
      message:
        "You have a lesson within the next 48 hours. Please contact Study Lab Co. or wait until it has passed.",
    };
  }

  // A future lesson paid for in cash or by transfer (not with a pass) is money the family is owed: cancelling it would lose it (I2).
  const paidFuture = (bookings.data as BookingRow[]).map(mapBooking).some(
    (b) => (b.status === "pending" || b.status === "confirmed") && b.startsAt > now && b.paymentStatus === "paid" && !b.passId,
  );
  if (paidFuture) {
    return {
      ok: false,
      reason: "has_credit_or_pass",
      message: "You have paid lessons coming up. Please contact Study Lab Co before deleting your account.",
    };
  }

  // Release slots and seats: all remaining future active bookings are outside the notice window, so free.
  const cancelPatch = { status: "cancelled", cancelled_at: now.toISOString(), cancelled_by: "parent" };
  for (const from of ["pass", "other"] as const) {
    const extra = from === "pass" ? { payment_status: "unpaid" } : {};
    let q = c
      .from("bookings")
      .update({ ...cancelPatch, ...extra })
      .eq("parent_id", parentId)
      .in("status", ["pending", "confirmed"])
      .gt("starts_at", now.toISOString());
    // A pass seat was paid for by the pass: its session goes back on the pass, nothing is credited.
    q = from === "pass" ? q.not("pass_id", "is", null) : q.is("pass_id", null);
    const r = await q;
    if (r.error) return failed("cancel future bookings", r.error);
  }

  // Personal data hanging off the parent's bookings and passes (not the money columns).
  const bookingIds = mine.map((b) => b.id);
  const passes = await c.from("passes").select("id").eq("parent_id", parentId);
  if (passes.error) return failed("load passes", passes.error);
  const passIds = (passes.data ?? []).map((p) => p.id as string);
  if (bookingIds.length) {
    const r = await c.from("email_log").delete().in("booking_id", bookingIds);
    if (r.error) return failed("delete email log", r.error);
    const m = await c.from("mileage").update({ note: "" }).in("booking_id", bookingIds);
    if (m.error) return failed("clear mileage notes", m.error);
  }
  if (passIds.length) {
    const r = await c.from("email_log").delete().in("pass_id", passIds);
    if (r.error) return failed("delete pass email log", r.error);
  }
  const ledgerFilters = [`parent_id.eq.${parentId}`];
  if (bookingIds.length) ledgerFilters.push(`booking_id.in.(${bookingIds.join(",")})`);
  if (passIds.length) ledgerFilters.push(`pass_id.in.(${passIds.join(",")})`);
  const ledger = await c.from("ledger").update({ note: "" }).or(ledgerFilters.join(","));
  if (ledger.error) return failed("clear ledger notes", ledger.error);

  const detach = await c
    .from("bookings")
    .update({ parent_id: null, child_id: null, home_address: null, home_postcode: null })
    .eq("parent_id", parentId);
  if (detach.error) return failed("detach bookings", detach.error);

  const consents = await c.from("consents").delete().eq("profile_id", parentId);
  if (consents.error) return failed("delete consents", consents.error);

  // Result attachments live in storage, which a cascade does not reach: remove the objects first.
  // A repeat finds the rows still there until the children go, so a failure part-way is safe to retry.
  const kids = await c.from("children").select("id").eq("parent_id", parentId);
  if (kids.error) return failed("load children", kids.error);
  if (kids.data.length) {
    const files = await c.from("test_results").select("attachment_path").in("child_id", kids.data.map((k) => k.id as string)).not("attachment_path", "is", null);
    if (files.error) return failed("load result files", files.error);
    const paths = files.data.map((f) => f.attachment_path as string);
    if (paths.length) {
      const rm = await c.storage.from("results").remove(paths);
      if (rm.error) return failed("delete result files", rm.error);
    }
  }

  // Emails about results are logged against the result (which the cascade below would orphan, keeping the address).
  // Delete those rows first, then (R10) any other log row addressed to this parent, matched case-insensitively.
  if (kids.data.length) {
    const results = await c.from("test_results").select("id").in("child_id", kids.data.map((k) => k.id as string));
    if (results.error) return failed("load results", results.error);
    if (results.data.length) {
      const r = await c.from("email_log").delete().in("result_id", results.data.map((x) => x.id as string));
      if (r.error) return failed("delete result email log", r.error);
    }
  }
  const email = (profile.data as { email?: string | null }).email?.toLowerCase();
  if (email) {
    // ilike treats % and _ as wildcards, so it only narrows the candidates; equality is checked here.
    const rows = await c.from("email_log").select("id, to_email").ilike("to_email", email);
    if (rows.error) return failed("load email log", rows.error);
    const ids = rows.data.filter((r) => (r.to_email as string).toLowerCase() === email).map((r) => r.id as string);
    if (ids.length) {
      const r = await c.from("email_log").delete().in("id", ids);
      if (r.error) return failed("delete email log by address", r.error);
    }
  }

  const children = await c.from("children").delete().eq("parent_id", parentId);
  if (children.error) return failed("delete children", children.error);

  const user = await c.auth.admin.deleteUser(parentId);
  if (user.error) return failed("delete auth user", user.error);
  return { ok: true };
}
