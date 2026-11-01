import "server-only";
import { mapBooking, type BookingRow } from "@/lib/supabase/mappers";
import { getSettings } from "@/lib/settings";
import { createServiceClient } from "@/lib/supabase/service";
import { londonDateOf } from "@/lib/time";
import { cancellationOutcome } from "./cancellation";
import { lateFeePence } from "./fees";
import { onBookingCancelled } from "./notify";

export type CancelResult =
  | { ok: true; outcome: "free" | "late"; feePence: number }
  | { ok: false; reason: "not_found" | "not_cancellable" | "error" }
  /** The booking is inside the notice window and the parent has not yet agreed to the fee. */
  | { ok: false; reason: "late_confirmation_needed"; feePence: number };

/**
 * A parent cancels one booking row (one Sunday session, or one week of a
 * block): the notice rule applies per row.
 *
 * - Only the parent's own pending/confirmed bookings that start in the future.
 * - Inside the notice window the cancellation is 'late' (status late_cancelled,
 *   fee = the late cancellation fee, 50% of the lesson price by default, no
 *   travel) and needs `confirmLate`.
 * - Within 14 days of making the booking it is free whatever the notice
 *   (cooling-off, Ruling R20): for a block week the block's created_at counts.
 * - A pending home visit is always free, whatever the time: the tutor never
 *   confirmed it, so no fee can be due.
 * - Free cancel of a paid booking sets payment_status 'credited' and writes a
 *   ledger 'credit' for what was paid for that row (price plus travel; a block
 *   week's stored price), dated today in London, like the tutor path (Ruling
 *   R23). The tutor can spend it with "Pay from credit" or refund it.
 * - The update is conditional on the status still being pending/confirmed, so
 *   two racing cancels cannot both succeed.
 */
export async function cancelBookingForParent(
  parentId: string,
  bookingId: string,
  opts: { confirmLate?: boolean; now?: Date } = {},
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
  let bookedAt = booking.createdAt;
  if (booking.blockBookingId) {
    const block = await c.from("block_bookings").select("created_at").eq("id", booking.blockBookingId).maybeSingle();
    if (block.error) return { ok: false, reason: "error" };
    if (block.data) bookedAt = new Date(block.data.created_at as string);
  }
  const neverConfirmed = booking.status === "pending" && booking.location === "home_visit";
  const outcome = neverConfirmed
    ? "free"
    : cancellationOutcome(booking.startsAt, now, settings.cancellationNoticeHours, "parent", bookedAt);
  if (outcome === "late" && !opts.confirmLate) {
    return { ok: false, reason: "late_confirmation_needed", feePence: lateFeePence(booking.pricePence, settings.lateFeePercent) };
  }

  const patch: Record<string, unknown> = {
    status: outcome === "free" ? "cancelled" : "late_cancelled",
    cancelled_at: now.toISOString(),
    cancelled_by: "parent",
  };
  if (outcome === "free" && booking.paymentStatus === "paid") patch.payment_status = "credited";
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

  await onBookingCancelled(bookingId, outcome);
  return { ok: true, outcome, feePence: outcome === "late" ? lateFeePence(booking.pricePence, settings.lateFeePercent) : 0 };
}
