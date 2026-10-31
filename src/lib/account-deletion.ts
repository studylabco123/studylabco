import "server-only";
import { formatPence } from "@/lib/format";
import { mapBooking, type BookingRow } from "@/lib/supabase/mappers";
import { createServiceClient } from "@/lib/supabase/service";
import { amountOwedPence } from "@/lib/booking/owed";
import { getSettings } from "@/lib/settings";

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; reason: "money_owed"; owedPence: number; message: string }
  | { ok: false; reason: "lesson_soon" | "not_a_parent"; message: string }
  | { ok: false; reason: "error"; message: string };

/**
 * Deletes a parent's account (service client; the caller passes the id of the
 * signed-in user, never a client-supplied id).
 *
 * Refuses for non-parent profiles (R13), while money is owed, and while a
 * pending/confirmed lesson starts inside the cancellation notice window (R12).
 * Otherwise, in this order: cancel every future pending/confirmed booking (free,
 * paid -> credited, so slots and seats are released), delete email_log rows and
 * free-text notes tied to the parent's bookings, detach bookings
 * (parent, child, home address and postcode set to null; price, travel fee,
 * status, dates and the ledger are kept), delete consents, delete children
 * (cascades agreements, notes and student status), and finally delete the auth
 * user (cascades the profile; ledger/block rows keep their amounts with a null
 * parent). The auth user goes last so a failure part-way leaves an account
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

  const profile = await c.from("profiles").select("role").eq("id", parentId).maybeSingle();
  if (profile.error) return failed("load profile", profile.error);
  if (profile.data?.role !== "parent") {
    return { ok: false, reason: "not_a_parent", message: "This account cannot be deleted here. Please contact Study Lab Co." };
  }

  const bookings = await c.from("bookings").select("*").eq("parent_id", parentId);
  if (bookings.error) return failed("load bookings", bookings.error);
  const owedPence = amountOwedPence((bookings.data as BookingRow[]).map(mapBooking), [], now);
  if (owedPence > 0) {
    return {
      ok: false,
      reason: "money_owed",
      owedPence,
      message: `You still owe ${formatPence(owedPence)}. We keep a record of what is owed, so please pay your balance before deleting your account.`,
    };
  }

  const settings = await getSettings();
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

  // Release slots and seats: all remaining future active bookings are outside the notice window, so free.
  const cancelPatch = { status: "cancelled", cancelled_at: now.toISOString(), cancelled_by: "parent" };
  for (const [from, extra] of [
    ["paid", { payment_status: "credited" }],
    ["other", {}],
  ] as const) {
    let q = c
      .from("bookings")
      .update({ ...cancelPatch, ...extra })
      .eq("parent_id", parentId)
      .in("status", ["pending", "confirmed"])
      .gt("starts_at", now.toISOString());
    q = from === "paid" ? q.eq("payment_status", "paid") : q.neq("payment_status", "paid");
    const r = await q;
    if (r.error) return failed("cancel future bookings", r.error);
  }

  // Personal data hanging off the parent's bookings (not the money columns).
  const bookingIds = mine.map((b) => b.id);
  const blocks = await c.from("block_bookings").select("id").eq("parent_id", parentId);
  if (blocks.error) return failed("load blocks", blocks.error);
  const blockIds = (blocks.data ?? []).map((b) => b.id as string);
  if (bookingIds.length) {
    const r = await c.from("email_log").delete().in("booking_id", bookingIds);
    if (r.error) return failed("delete email log", r.error);
    const m = await c.from("mileage").update({ note: "" }).in("booking_id", bookingIds);
    if (m.error) return failed("clear mileage notes", m.error);
  }
  if (blockIds.length) {
    const r = await c.from("email_log").delete().in("block_booking_id", blockIds);
    if (r.error) return failed("delete block email log", r.error);
  }
  const ledgerFilters = [`parent_id.eq.${parentId}`];
  if (bookingIds.length) ledgerFilters.push(`booking_id.in.(${bookingIds.join(",")})`);
  if (blockIds.length) ledgerFilters.push(`block_booking_id.in.(${blockIds.join(",")})`);
  const ledger = await c.from("ledger").update({ note: "" }).or(ledgerFilters.join(","));
  if (ledger.error) return failed("clear ledger notes", ledger.error);

  const detach = await c
    .from("bookings")
    .update({ parent_id: null, child_id: null, home_address: null, home_postcode: null })
    .eq("parent_id", parentId);
  if (detach.error) return failed("detach bookings", detach.error);

  const consents = await c.from("consents").delete().eq("profile_id", parentId);
  if (consents.error) return failed("delete consents", consents.error);

  const children = await c.from("children").delete().eq("parent_id", parentId);
  if (children.error) return failed("delete children", children.error);

  const user = await c.auth.admin.deleteUser(parentId);
  if (user.error) return failed("delete auth user", user.error);
  return { ok: true };
}
