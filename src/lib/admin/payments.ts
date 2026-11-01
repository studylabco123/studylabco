import "server-only";
import { mapBooking, type BookingRow } from "@/lib/supabase/mappers";
import { createServiceClient } from "@/lib/supabase/service";
import { londonDateOf } from "@/lib/time";
import type { Booking, PaymentMethod } from "@/lib/types";
import { fail, NOT_FOUND, OK, unexpected, type AdminResult, type Failure, type OpOptions } from "./result";

const db = () => createServiceClient();

/**
 * What a booking owes if unpaid (Ruling R11): a late cancellation is the lesson
 * price only; everything else is stored price plus stored travel fee.
 */
export function dueFor(b: Pick<Booking, "status" | "pricePence" | "travelFeePence">): number {
  return b.status === "late_cancelled" ? b.pricePence : b.pricePence + b.travelFeePence;
}

async function loadBooking(id: string): Promise<{ booking: Booking } | { error: Failure }> {
  const { data, error } = await db().from("bookings").select("*").eq("id", id).maybeSingle();
  if (error) return { error: error.code === "22P02" ? NOT_FOUND : unexpected("load booking", error) };
  if (!data) return { error: NOT_FOUND };
  return { booking: mapBooking(data as BookingRow) };
}

/**
 * Records that a booking was paid: payment_status 'paid' plus one ledger
 * payment (stored price + travel, or the price alone for a late cancellation),
 * dated today in London. A row of a block is paid through markBlockPaid. A
 * Sunday bundle row pays the whole bundle (both rows, one ledger payment for
 * the total, referencing the first booking).
 *
 * The status flip is conditional on 'unpaid', so a double click cannot write
 * two payments; if the ledger insert fails the flip is undone.
 */
export async function markPaid(bookingId: string, method: PaymentMethod, opts: OpOptions = {}): Promise<AdminResult> {
  const found = await loadBooking(bookingId);
  if ("error" in found) return found.error;
  const b = found.booking;
  if (b.blockBookingId) return fail("This session is part of a block. Mark the block paid instead.");
  if (b.status === "cancelled" || b.status === "declined") return fail("Nothing is owed for a cancelled or declined booking.");
  if (b.paymentStatus !== "unpaid") return fail("This booking is not waiting for payment.");

  let rows: Booking[] = [b];
  if (b.bundleId) {
    const { data, error } = await db().from("bookings").select("*").eq("bundle_id", b.bundleId).order("starts_at");
    if (error) return unexpected("load bundle", error);
    rows = (data as BookingRow[])
      .map(mapBooking)
      .filter((r) => r.paymentStatus === "unpaid" && r.status !== "cancelled" && r.status !== "declined");
    if (rows.length === 0) return fail("This bundle is not waiting for payment.");
  }
  const ids = rows.map((r) => r.id);
  const total = rows.reduce((n, r) => n + dueFor(r), 0);

  const flipped = await db()
    .from("bookings")
    .update({ payment_status: "paid" })
    .in("id", ids)
    .eq("payment_status", "unpaid")
    .select("id");
  if (flipped.error) return unexpected("mark paid", flipped.error);
  if ((flipped.data?.length ?? 0) !== ids.length) {
    // Someone else changed it meanwhile: put back what we flipped.
    const done = (flipped.data ?? []).map((r) => r.id as string);
    if (done.length) await db().from("bookings").update({ payment_status: "unpaid" }).in("id", done);
    return fail("This booking was just updated. Please refresh and check.");
  }

  const entry = await db().from("ledger").insert({
    booking_id: rows[0].id,
    parent_id: b.parentId,
    kind: "payment",
    method,
    amount_pence: total,
    occurred_on: londonDateOf(opts.now ?? new Date()),
    note: rows.length > 1 ? `Sunday bundle (${rows.length} sessions)` : "",
  });
  if (entry.error) {
    await db().from("bookings").update({ payment_status: "unpaid" }).in("id", ids);
    return unexpected("write ledger payment", entry.error);
  }
  return OK;
}

/** Marks a block paid: the block row, every unpaid live session in it, and one ledger payment of the block price. */
export async function markBlockPaid(blockId: string, method: PaymentMethod, opts: OpOptions = {}): Promise<AdminResult> {
  const block = await db()
    .from("block_bookings")
    .select("id, parent_id, price_pence, status")
    .eq("id", blockId)
    .maybeSingle();
  if (block.error) return block.error.code === "22P02" ? fail("We could not find that block.") : unexpected("load block", block.error);
  if (!block.data) return fail("We could not find that block.");
  if (block.data.status === "paid") return fail("This block is already paid.");
  if (block.data.status === "released") return fail("This block was released, so it cannot be paid.");

  const flipped = await db()
    .from("block_bookings")
    .update({ status: "paid" })
    .eq("id", blockId)
    .eq("status", "held")
    .select("id");
  if (flipped.error) return unexpected("mark block paid", flipped.error);
  if (!flipped.data?.length) return fail("This block was just updated. Please refresh and check.");

  const rows = await db()
    .from("bookings")
    .update({ payment_status: "paid" })
    .eq("block_booking_id", blockId)
    .eq("payment_status", "unpaid")
    .not("status", "in", "(cancelled,declined)")
    .select("id");
  const entry = rows.error
    ? { error: rows.error }
    : await db().from("ledger").insert({
        block_booking_id: blockId,
        parent_id: block.data.parent_id,
        kind: "payment",
        method,
        amount_pence: block.data.price_pence,
        occurred_on: londonDateOf(opts.now ?? new Date()),
        note: "Block booking",
      });
  if (entry.error) {
    await db().from("bookings").update({ payment_status: "unpaid" }).in("id", (rows.data ?? []).map((r) => r.id as string));
    await db().from("block_bookings").update({ status: "held" }).eq("id", blockId);
    return unexpected("write block payment", entry.error);
  }
  return OK;
}

/** Waives an unpaid fee: payment_status 'waived' plus a ledger waiver for what was owed. */
export async function waiveFee(bookingId: string, opts: OpOptions = {}): Promise<AdminResult> {
  const found = await loadBooking(bookingId);
  if ("error" in found) return found.error;
  const b = found.booking;
  if (b.paymentStatus !== "unpaid") return fail("There is no unpaid fee on this booking.");

  const flipped = await db()
    .from("bookings")
    .update({ payment_status: "waived" })
    .eq("id", bookingId)
    .eq("payment_status", "unpaid")
    .select("id");
  if (flipped.error) return unexpected("waive fee", flipped.error);
  if (!flipped.data?.length) return fail("This booking was just updated. Please refresh and check.");

  const entry = await db().from("ledger").insert({
    booking_id: bookingId,
    parent_id: b.parentId,
    kind: "waiver",
    amount_pence: dueFor(b),
    occurred_on: londonDateOf(opts.now ?? new Date()),
  });
  if (entry.error) {
    await db().from("bookings").update({ payment_status: "unpaid" }).eq("id", bookingId);
    return unexpected("write waiver", entry.error);
  }
  return OK;
}
