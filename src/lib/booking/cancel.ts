import "server-only";
import { mapBooking, type BookingRow } from "@/lib/supabase/mappers";
import { getSettings } from "@/lib/settings";
import { createServiceClient } from "@/lib/supabase/service";
import { londonDateOf } from "@/lib/time";
import { cancellationDecision, parentCanCancelOnline } from "./cancellation";
import { onBookingCancelled } from "./notify";

export type CancelResult =
  | { ok: true; outcome: "free"; feePence: 0 }
  | { ok: false; reason: "not_found" | "not_cancellable" | "error" }
  /** Inside the notice window: the parent must call or email; the tutor records any late cancellation. */
  | { ok: false; reason: "call_required"; free: boolean };

/**
 * A parent cancels one booking row (one Sunday session, or one session booked
 * with a group pass) on the website.
 *
 * - Only the parent's own pending/confirmed bookings that start in the future.
 * - Only while the lesson is at least `cancellationNoticeHours` away
 *   (`parentCanCancelOnline`). Inside that window the answer is 'call_required':
 *   the parent phones or emails and the tutor records it with
 *   `recordLateCancellation` (which applies the 14-day cooling-off and the
 *   late cancellation fee). There is no late path here. A pending home
 *   visit (never confirmed) is the exception: free online at any time.
 * - A free cancel of a paid booking sets payment_status 'credited' and writes a
 *   ledger 'credit' for what was paid for that row (price plus travel), dated
 *   today in London, like the tutor path (Ruling R23). The tutor can spend it
 *   with "Pay from credit" or refund it.
 * - A pass seat's session goes back on the pass instead: no credit, no fee
 *   (payment_status 'unpaid'). Its 14-day cooling-off counts from when the
 *   pass was bought.
 * - The update is conditional on the status still being pending/confirmed, so
 *   two racing cancels cannot both succeed.
 */
export async function cancelBookingForParent(
  parentId: string,
  bookingId: string,
  opts: { now?: Date } = {},
): Promise<CancelResult> {
  const now = opts.now ?? new Date();
  const c = createServiceClient();
  const found = await c.from("bookings").select("*").eq("id", bookingId).eq("parent_id", parentId).maybeSingle();
  // An invalid uuid is just "not found".
  if (found.error) return found.error.code === "22P02" ? { ok: false, reason: "not_found" } : { ok: false, reason: "error" };
  if (!found.data) return { ok: false, reason: "not_found" };
  const booking = mapBooking(found.data as BookingRow);
  if ((booking.status !== "pending" && booking.status !== "confirmed") || booking.startsAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "not_cancellable" };
  }

  const settings = await getSettings();
  // A pending home visit was never confirmed by the tutor, so it can be cancelled online at any time, free (Ruling R5).
  const neverConfirmed = booking.status === "pending" && booking.location === "home_visit";
  if (!neverConfirmed && !parentCanCancelOnline(booking.startsAt, now, settings.cancellationNoticeHours)) {
    let bookedAt = booking.createdAt;
    if (booking.passId) {
      const pass = await c.from("passes").select("created_at").eq("id", booking.passId).maybeSingle();
      if (pass.data) bookedAt = new Date(pass.data.created_at as string);
    }
    const free = cancellationDecision(booking.startsAt, now, settings.cancellationNoticeHours, "parent", bookedAt).reason === "cooling_off";
    return { ok: false, reason: "call_required", free };
  }

  const patch: Record<string, unknown> = {
    status: "cancelled",
    cancelled_at: now.toISOString(),
    cancelled_by: "parent",
  };
  if (booking.passId) patch.payment_status = "unpaid";
  else if (booking.paymentStatus === "paid") patch.payment_status = "credited";
  const updated = await c
    .from("bookings")
    .update(patch)
    .eq("id", bookingId)
    .eq("parent_id", parentId)
    .in("status", ["pending", "confirmed"])
    .select("id");
  if (updated.error) {
    console.error("cancelBooking failed", updated.error);
    return { ok: false, reason: "error" };
  }
  if (!updated.data?.length) return { ok: false, reason: "not_cancellable" };

  if (patch.payment_status === "credited") {
    const entry = await c.from("ledger").insert({
      booking_id: bookingId,
      parent_id: parentId,
      kind: "credit",
      amount_pence: booking.pricePence + booking.travelFeePence,
      occurred_on: londonDateOf(now),
      note: "Cancelled by parent",
    });
    // The cancellation stands either way; the tutor can add the credit by hand.
    if (entry.error) console.error("cancelBooking: credit ledger row failed", entry.error.message);
  }

  await onBookingCancelled(bookingId, "free");
  return { ok: true, outcome: "free", feePence: 0 };
}
