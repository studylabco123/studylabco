import "server-only";
import { mapBooking, type BookingRow } from "@/lib/supabase/mappers";
import { createServiceClient } from "@/lib/supabase/service";
import { bookingFeePence, DEFAULT_LATE_FEE_PERCENT } from "@/lib/booking/fees";
import { getSettings } from "@/lib/settings";
import { blockDuePence } from "@/lib/booking/payment-view";
import { formatPence } from "@/lib/format";
import { londonDateOf } from "@/lib/time";
import type { Booking, PaymentMethod } from "@/lib/types";
import { fail, NOT_FOUND, OK, unexpected, type AdminResult, type Failure, type OpOptions } from "./result";

const db = () => createServiceClient();

/**
 * What a booking owes if unpaid, from its stored prices: see `bookingFeePence`
 * (a late cancellation is the late cancellation fee, no travel).
 */
export function dueFor(
  b: Pick<Booking, "status" | "location" | "pricePence" | "travelFeePence" | "feePence">,
  lateFeePercent: number = DEFAULT_LATE_FEE_PERCENT,
): number {
  return bookingFeePence(b, lateFeePercent);
}

async function loadBooking(id: string): Promise<{ booking: Booking } | { error: Failure }> {
  const { data, error } = await db().from("bookings").select("*").eq("id", id).maybeSingle();
  if (error) return { error: error.code === "22P02" ? NOT_FOUND : unexpected("load booking", error) };
  if (!data) return { error: NOT_FOUND };
  return { booking: mapBooking(data as BookingRow) };
}

/** How a booking or block is being settled: money received, or the family's credit (Ruling R23). */
type Settlement = { by: "payment"; method: PaymentMethod } | { by: "credit" };

/** A family's credit balance in pence: ledger 'credit' minus 'credit_applied' (Ruling R23). */
export async function familyCreditPence(parentId: string): Promise<number> {
  const { data, error } = await db().rpc("credit_balance", { p_parent: parentId });
  if (error) throw new Error(`Could not load credit: ${error.message}`);
  return typeof data === "number" ? data : 0;
}

const notEnough = (balance: number, due: number) =>
  fail(`This family has ${formatPence(balance)} of credit, which does not cover ${formatPence(due)}.`);

/**
 * Writes the ledger side of a settlement. A payment is one 'payment' row
 * (turnover). Credit is one 'credit_applied' row written by apply_credit,
 * which locks the family's credit and refuses if the balance does not cover
 * it; it is not turnover (the money was counted when first paid).
 */
async function recordSettlement(
  how: Settlement,
  row: { booking_id: string | null; block_booking_id: string | null; parent_id: string | null; amount_pence: number; occurred_on: string; note: string },
): Promise<{ ok: true } | Failure> {
  if (how.by === "payment") {
    const entry = await db().from("ledger").insert({ ...row, kind: "payment", method: how.method });
    return entry.error ? unexpected("write ledger payment", entry.error) : { ok: true };
  }
  if (!row.parent_id) return fail("This booking has no family account, so credit cannot be used.");
  const res = await db().rpc("apply_credit", {
    p_parent: row.parent_id,
    p_amount: row.amount_pence,
    p_booking: row.booking_id,
    p_block: row.block_booking_id,
    p_on: row.occurred_on,
    p_note: row.note,
  });
  if (res.error) return unexpected("apply credit", res.error);
  if (typeof res.data !== "number" || res.data < 0) return notEnough(await familyCreditPence(row.parent_id), row.amount_pence);
  return { ok: true };
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
  return settleBooking(bookingId, { by: "payment", method }, opts);
}

/**
 * Pays an unpaid booking that is owed or upcoming from the same family's
 * credit (Ruling R23): it becomes 'paid' with a 'credit_applied' ledger row
 * and no 'payment' row, so turnover is not counted twice. A week of a held
 * block pays the whole block at its amount due (I3). Refused when the
 * family's balance does not cover the amount.
 */
export async function payFromCredit(bookingId: string, opts: OpOptions = {}): Promise<AdminResult> {
  const found = await loadBooking(bookingId);
  if ("error" in found) return found.error;
  const b = found.booking;
  if (b.blockBookingId) {
    const blk = await db().from("block_bookings").select("status").eq("id", b.blockBookingId).maybeSingle();
    if (blk.error) return unexpected("load block", blk.error);
    if (blk.data?.status === "held") return settleBlock(b.blockBookingId, { by: "credit" }, opts);
  }
  return settleBooking(bookingId, { by: "credit" }, opts);
}

async function settleBooking(bookingId: string, how: Settlement, opts: OpOptions): Promise<AdminResult> {
  const found = await loadBooking(bookingId);
  if ("error" in found) return found.error;
  const b = found.booking;
  let releasedBlockRow = false;
  if (b.blockBookingId) {
    const blk = await db().from("block_bookings").select("status").eq("id", b.blockBookingId).maybeSingle();
    if (blk.error) return unexpected("load block", blk.error);
    // A released block is no longer paid as a whole, but lessons already taught from it are still owed one by one.
    if (blk.data?.status !== "released") {
      return fail(
        blk.data?.status === "paid"
          ? "This session is part of a block that is already paid."
          : "This session is part of a block. Mark the block paid instead.",
      );
    }
    releasedBlockRow = true;
  }
  if (b.status === "cancelled" || b.status === "declined") return fail("Nothing is owed for a cancelled or declined booking.");
  if (b.status === "pending" && b.location === "home_visit") return fail("Approve this home visit before recording payment.");
  if (b.paymentStatus !== "unpaid") return fail("This booking is not waiting for payment.");

  let rows: Booking[] = [b];
  if (b.bundleId && !releasedBlockRow) {
    const { data, error } = await db().from("bookings").select("*").eq("bundle_id", b.bundleId).order("starts_at");
    if (error) return unexpected("load bundle", error);
    rows = (data as BookingRow[])
      .map(mapBooking)
      .filter((r) => r.paymentStatus === "unpaid" && r.status !== "cancelled" && r.status !== "declined");
    if (rows.length === 0) return fail("This bundle is not waiting for payment.");
  }
  const ids = rows.map((r) => r.id);
  const { lateFeePercent } = await getSettings();
  const total = rows.reduce((n, r) => n + dueFor(r, lateFeePercent), 0);

  if (how.by === "credit") {
    if (!b.parentId) return fail("This booking has no family account, so credit cannot be used.");
    const balance = await familyCreditPence(b.parentId);
    if (balance < total) return notEnough(balance, total);
  }

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

  const bundleNote = rows.length > 1 ? `Sunday bundle (${rows.length} sessions)` : "";
  const recorded = await recordSettlement(how, {
    booking_id: rows[0].id,
    block_booking_id: null,
    parent_id: b.parentId,
    amount_pence: total,
    occurred_on: londonDateOf(opts.now ?? new Date()),
    note: how.by === "credit" ? ["Paid from credit", bundleNote].filter(Boolean).join(" · ") : bundleNote,
  });
  if (!recorded.ok) {
    await db().from("bookings").update({ payment_status: "unpaid" }).in("id", ids);
    return recorded;
  }
  return OK;
}

/**
 * Marks a block paid: the block row, every unpaid live session in it, and one
 * ledger payment of the block's amount due: its price less the stored prices
 * of weeks cancelled for free (review I3).
 */
export async function markBlockPaid(blockId: string, method: PaymentMethod, opts: OpOptions = {}): Promise<AdminResult> {
  return settleBlock(blockId, { by: "payment", method }, opts);
}

async function settleBlock(blockId: string, how: Settlement, opts: OpOptions): Promise<AdminResult> {
  const block = await db()
    .from("block_bookings")
    .select("id, parent_id, price_pence, status")
    .eq("id", blockId)
    .maybeSingle();
  if (block.error) return block.error.code === "22P02" ? fail("We could not find that block.") : unexpected("load block", block.error);
  if (!block.data) return fail("We could not find that block.");
  if (block.data.status === "paid") return fail("This block is already paid.");
  if (block.data.status === "released") return fail("This block was released, so it cannot be paid.");

  const seats = await db().from("bookings").select("status, price_pence").eq("block_booking_id", blockId);
  if (seats.error) return unexpected("load block sessions", seats.error);
  const due = blockDuePence(
    block.data.price_pence as number,
    (seats.data as { status: Booking["status"]; price_pence: number }[]).map((r) => ({ status: r.status, pricePence: r.price_pence })),
  );
  if (due <= 0) return fail("Nothing is due on this block: every week was cancelled for free.");
  const parentId = block.data.parent_id as string | null;
  if (how.by === "credit") {
    if (!parentId) return fail("This block has no family account, so credit cannot be used.");
    const balance = await familyCreditPence(parentId);
    if (balance < due) return notEnough(balance, due);
  }

  const flipped = await db()
    .from("block_bookings")
    .update({ status: "paid" })
    .eq("id", blockId)
    .eq("status", "held")
    .select("id");
  if (flipped.error) return unexpected("mark block paid", flipped.error);
  if (!flipped.data?.length) return fail("This block was just updated. Please refresh and check.");

  const undo = async (ids: string[]) => {
    if (ids.length) await db().from("bookings").update({ payment_status: "unpaid" }).in("id", ids);
    await db().from("block_bookings").update({ status: "held" }).eq("id", blockId);
  };
  const rows = await db()
    .from("bookings")
    .update({ payment_status: "paid" })
    .eq("block_booking_id", blockId)
    .eq("payment_status", "unpaid")
    .not("status", "in", "(cancelled,declined)")
    .select("id");
  if (rows.error) {
    await undo([]);
    return unexpected("mark block sessions paid", rows.error);
  }
  const recorded = await recordSettlement(how, {
    booking_id: null,
    block_booking_id: blockId,
    parent_id: parentId,
    amount_pence: due,
    occurred_on: londonDateOf(opts.now ?? new Date()),
    note: how.by === "credit" ? "Block booking paid from credit" : "Block booking",
  });
  if (!recorded.ok) {
    await undo((rows.data ?? []).map((r) => r.id as string));
    return recorded;
  }
  return OK;
}

/** Waives an unpaid fee: payment_status 'waived', fee_pence 0, plus a ledger waiver for what was owed. */
export async function waiveFee(bookingId: string, opts: OpOptions = {}): Promise<AdminResult> {
  const found = await loadBooking(bookingId);
  if ("error" in found) return found.error;
  const b = found.booking;
  if (b.paymentStatus !== "unpaid") return fail("There is no unpaid fee on this booking.");
  const owed =
    b.status === "late_cancelled" ||
    b.status === "no_show" ||
    b.status === "attended" ||
    (b.status === "confirmed" && b.startsAt.getTime() <= (opts.now ?? new Date()).getTime());
  if (!owed) return fail("Nothing is owed on this booking yet, so there is no fee to waive.");

  const flipped = await db()
    .from("bookings")
    .update({ payment_status: "waived", fee_pence: 0 })
    .eq("id", bookingId)
    .eq("payment_status", "unpaid")
    .select("id");
  if (flipped.error) return unexpected("waive fee", flipped.error);
  if (!flipped.data?.length) return fail("This booking was just updated. Please refresh and check.");

  const entry = await db().from("ledger").insert({
    booking_id: bookingId,
    parent_id: b.parentId,
    kind: "waiver",
    amount_pence: dueFor(b, (await getSettings()).lateFeePercent),
    occurred_on: londonDateOf(opts.now ?? new Date()),
  });
  if (entry.error) {
    await db().from("bookings").update({ payment_status: "unpaid", fee_pence: b.feePence }).eq("id", bookingId);
    return unexpected("write waiver", entry.error);
  }
  return OK;
}
