import "server-only";
import { mapBooking, type BookingRow } from "@/lib/supabase/mappers";
import { cancellationDecision } from "@/lib/booking/cancellation";
import { bookingFeePence, lateFeePence } from "@/lib/booking/fees";
import { onBookingCancelled } from "@/lib/booking/notify";
import { getSettings } from "@/lib/settings";
import { createServiceClient } from "@/lib/supabase/service";
import { londonDateOf } from "@/lib/time";
import type { Booking } from "@/lib/types";
import { notifyHomeVisitDecision, notifyTutorCancelled } from "./notify";
import { dueFor } from "./payments";
import { fail, NOT_FOUND, OK, unexpected, type AdminResult, type Failure, type OpOptions } from "./result";

const db = () => createServiceClient();

async function loadBooking(id: string): Promise<{ booking: Booking } | { error: Failure }> {
  const { data, error } = await db().from("bookings").select("*").eq("id", id).maybeSingle();
  if (error) return { error: error.code === "22P02" ? NOT_FOUND : unexpected("load booking", error) };
  if (!data) return { error: NOT_FOUND };
  return { booking: mapBooking(data as BookingRow) };
}

/**
 * confirmed -> attended / no_show, once the lesson has started.
 *
 * A no-show records the late cancellation fee (Settings percentage of the
 * price) in fee_pence; a home visit also owes its travel (see `bookingFeePence`).
 * If the booking was already paid, payment_status stays 'paid' and what was
 * paid beyond the fee is written as a ledger 'credit'. A pass seat records the
 * status only: its fee is handled with passes (Task V5).
 */
async function conclude(bookingId: string, to: "attended" | "no_show", now: Date): Promise<AdminResult> {
  const found = await loadBooking(bookingId);
  if ("error" in found) return found.error;
  const b = found.booking;
  if (b.status !== "confirmed") return fail("Only a confirmed lesson can be marked like this.");
  if (b.startsAt.getTime() > now.getTime()) return fail("This lesson has not started yet.");

  const patch: Record<string, unknown> = { status: to };
  let credit = 0;
  if (to === "no_show" && !b.passId) {
    const { lateFeePercent } = await getSettings();
    const fee = lateFeePence(b.pricePence, lateFeePercent);
    patch.fee_pence = fee;
    if (b.paymentStatus === "paid") {
      credit = Math.max(0, b.pricePence + b.travelFeePence - bookingFeePence({ ...b, status: "no_show", feePence: fee }, lateFeePercent));
    }
  }
  const res = await db().from("bookings").update(patch).eq("id", bookingId).eq("status", "confirmed").select("id");
  if (res.error) return unexpected(`mark ${to}`, res.error);
  if (!res.data?.length) return fail("This booking was just updated. Please refresh and check.");

  if (credit > 0) {
    const entry = await db().from("ledger").insert({
      booking_id: bookingId,
      parent_id: b.parentId,
      kind: "credit",
      amount_pence: credit,
      occurred_on: londonDateOf(now),
      note: "No-show: paid amount beyond the fee",
    });
    if (entry.error) {
      console.error("admin: no-show credit ledger failed", entry.error.message);
      return fail("The no-show is recorded but the credit could not be saved. Please add it in Money.");
    }
  }
  return OK;
}

export const markAttended = (bookingId: string, opts: OpOptions = {}) => conclude(bookingId, "attended", opts.now ?? new Date());
export const markNoShow = (bookingId: string, opts: OpOptions = {}) => conclude(bookingId, "no_show", opts.now ?? new Date());

/**
 * The tutor records a cancellation the parent made by phone or email (parents
 * cannot cancel inside the notice window on the website). Applies to a pending
 * or confirmed booking, future or already started.
 *
 * - Free (status 'cancelled'): at least `cancellationNoticeHours` ahead, within
 *   the 14-day cooling-off (a block counts from the block's created_at), or a
 *   pending home visit the tutor never confirmed. A paid booking becomes
 *   'credited' with a ledger credit for what was paid.
 * - Otherwise 'late_cancelled' with fee_pence = the Settings percentage of the
 *   price (never travel). Unpaid: the fee is owed. Paid: it stays 'paid' and a
 *   ledger credit of price + travel - fee is written.
 * - cancelled_by is 'parent'. A pass seat is refused (handled with passes, Task V5).
 * - The parent gets a CancellationReceipt; a failed email never undoes it.
 */
export async function recordLateCancellation(bookingId: string, opts: OpOptions = {}): Promise<AdminResult> {
  const now = opts.now ?? new Date();
  const found = await loadBooking(bookingId);
  if ("error" in found) return found.error;
  const b = found.booking;
  if (b.status !== "pending" && b.status !== "confirmed") return fail("Only a pending or confirmed booking can be cancelled.");
  if (b.passId) return fail("This lesson is a pass session. Cancel it from the pass instead.");

  const settings = await getSettings();
  let bookedAt = b.createdAt;
  if (b.blockBookingId) {
    const blk = await db().from("block_bookings").select("created_at").eq("id", b.blockBookingId).maybeSingle();
    if (blk.error) return unexpected("load block", blk.error);
    if (blk.data) bookedAt = new Date(blk.data.created_at as string);
  }
  const neverConfirmed = b.status === "pending" && b.location === "home_visit";
  const free = neverConfirmed || cancellationDecision(b.startsAt, now, settings.cancellationNoticeHours, "parent", bookedAt).outcome === "free";

  const fee = free ? null : lateFeePence(b.pricePence, settings.lateFeePercent);
  const wasPaid = b.paymentStatus === "paid";
  const patch: Record<string, unknown> = {
    status: free ? "cancelled" : "late_cancelled",
    cancelled_by: "parent",
    cancelled_at: now.toISOString(),
  };
  if (fee !== null) patch.fee_pence = fee;
  if (free && wasPaid) patch.payment_status = "credited";
  const res = await db().from("bookings").update(patch).eq("id", bookingId).in("status", ["pending", "confirmed"]).select("id");
  if (res.error) return unexpected("record late cancellation", res.error);
  if (!res.data?.length) return fail("This booking was just updated. Please refresh and check.");

  const credit = wasPaid ? b.pricePence + b.travelFeePence - (fee ?? 0) : 0;
  if (credit > 0) {
    const entry = await db().from("ledger").insert({
      booking_id: bookingId,
      parent_id: b.parentId,
      kind: "credit",
      amount_pence: credit,
      occurred_on: londonDateOf(now),
      note: free ? "Cancelled by parent" : "Late cancellation: paid amount beyond the fee",
    });
    if (entry.error) {
      console.error("admin: late cancellation ledger failed", entry.error.message);
      return fail("The booking is cancelled but the credit could not be saved. Please add it in Money.");
    }
  }
  await onBookingCancelled(bookingId, free ? "free" : "late", { byAdmin: true });
  return OK;
}

/**
 * The tutor cancels a pending or confirmed booking: no fee ever. A paid
 * booking is refunded (ledger 'refund', payment_status 'refunded') or credited
 * (ledger 'credit', 'credited'). The parent gets an email.
 */
export async function tutorCancel(bookingId: string, refund: boolean, opts: OpOptions = {}): Promise<AdminResult> {
  const now = opts.now ?? new Date();
  const found = await loadBooking(bookingId);
  if ("error" in found) return found.error;
  const b = found.booking;
  if (b.status !== "pending" && b.status !== "confirmed") return fail("Only a pending or confirmed booking can be cancelled.");

  const wasPaid = b.paymentStatus === "paid";
  const patch: Record<string, unknown> = { status: "cancelled", cancelled_by: "tutor", cancelled_at: now.toISOString() };
  if (wasPaid) patch.payment_status = refund ? "refunded" : "credited";
  const res = await db().from("bookings").update(patch).eq("id", bookingId).in("status", ["pending", "confirmed"]).select("id");
  if (res.error) return unexpected("tutor cancel", res.error);
  if (!res.data?.length) return fail("This booking was just updated. Please refresh and check.");

  if (wasPaid) {
    const entry = await db().from("ledger").insert({
      booking_id: bookingId,
      parent_id: b.parentId,
      kind: refund ? "refund" : "credit",
      amount_pence: dueFor({ ...b, status: "confirmed" }),
      occurred_on: londonDateOf(now),
      note: "Cancelled by tutor",
    });
    if (entry.error) {
      // The booking is cancelled either way; say so rather than leave the ledger silently short.
      console.error("admin: tutor cancel ledger failed", entry.error.message);
      return fail("The booking is cancelled but the ledger entry could not be saved. Please add it in Money.");
    }
  }
  await notifyTutorCancelled(bookingId, wasPaid && refund);
  return OK;
}

/**
 * Approve or decline a pending home visit. Approving confirms it, records the
 * decision time and a mileage row for the visit date (miles filled in later),
 * and emails the family; declining marks it declined and emails the family.
 */
export async function decideHomeVisit(bookingId: string, approve: boolean, opts: OpOptions = {}): Promise<AdminResult> {
  const now = opts.now ?? new Date();
  const found = await loadBooking(bookingId);
  if ("error" in found) return found.error;
  const b = found.booking;
  if (b.status !== "pending" || b.location !== "home_visit") return fail("This is not a home visit waiting for a decision.");

  const res = await db()
    .from("bookings")
    .update({ status: approve ? "confirmed" : "declined", decided_at: now.toISOString() })
    .eq("id", bookingId)
    .eq("status", "pending")
    .select("id");
  if (res.error) return unexpected("decide home visit", res.error);
  if (!res.data?.length) return fail("This request was just decided. Please refresh and check.");

  if (approve) {
    const m = await db().from("mileage").insert({
      booking_id: bookingId,
      trip_on: londonDateOf(b.startsAt),
      miles: null,
      note: "Home visit",
    });
    if (m.error) console.error("admin: mileage row failed", m.error.message);
  }
  await notifyHomeVisitDecision(bookingId, approve);
  return OK;
}

/**
 * Releases a block (for example an unpaid hold that ran out): the block becomes
 * 'released' and its future pending/confirmed sessions are cancelled by the
 * tutor, freeing the seats. A paid block is refused: cancel its sessions one
 * by one so each can be refunded or credited.
 */
export async function releaseBlock(blockId: string, opts: OpOptions = {}): Promise<AdminResult> {
  const now = opts.now ?? new Date();
  const block = await db().from("block_bookings").select("id, status").eq("id", blockId).maybeSingle();
  if (block.error) return block.error.code === "22P02" ? fail("We could not find that block.") : unexpected("load block", block.error);
  if (!block.data) return fail("We could not find that block.");
  if (block.data.status === "paid") {
    return fail("This block is paid. Cancel its sessions one by one so each can be refunded or credited.");
  }
  if (block.data.status === "released") return fail("This block is already released.");

  const flipped = await db().from("block_bookings").update({ status: "released" }).eq("id", blockId).eq("status", "held").select("id");
  if (flipped.error) return unexpected("release block", flipped.error);
  if (!flipped.data?.length) return fail("This block was just updated. Please refresh and check.");

  const cancelled = await db()
    .from("bookings")
    .update({ status: "cancelled", cancelled_by: "tutor", cancelled_at: now.toISOString() })
    .eq("block_booking_id", blockId)
    .in("status", ["pending", "confirmed"])
    .gt("starts_at", now.toISOString());
  if (cancelled.error) return unexpected("cancel block sessions", cancelled.error);
  return OK;
}
