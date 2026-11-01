import "server-only";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { londonDateOf } from "@/lib/time";
import { checkReceipt, parseExpense, parseMiles } from "@/lib/money/validation";
import { poundsToPence } from "./settings-validation";
import { fail, OK, unexpected, type AdminResult, type OpOptions } from "./result";

const db = () => createServiceClient();
export const RECEIPT_BUCKET = "receipts";

export interface ExpenseForm {
  date: unknown;
  category: unknown;
  description: unknown;
  amount: unknown;
  receipt?: File | null;
}

/**
 * Records an expense, with an optional receipt (image or PDF, 10 MB at most)
 * stored privately at receipts/YYYY/<uuid>.<ext>. The file is checked here,
 * on the server, whatever the browser said. If the row cannot be saved the
 * uploaded file is removed again.
 */
export async function addExpense(form: ExpenseForm, opts: OpOptions = {}): Promise<AdminResult> {
  const parsed = parseExpense(form, londonDateOf(opts.now ?? new Date()));
  if (!parsed.ok) return fail(parsed.message);
  const e = parsed.value;

  let path: string | null = null;
  const file = form.receipt;
  if (file && file.size > 0) {
    const checked = checkReceipt(file);
    if (!checked.ok) return fail(checked.message);
    path = `receipts/${e.spentOn.slice(0, 4)}/${randomUUID()}.${checked.value.ext}`;
    const up = await db().storage.from(RECEIPT_BUCKET).upload(path, await file.arrayBuffer(), {
      contentType: file.type,
      upsert: false,
    });
    if (up.error) return unexpected("upload receipt", up.error);
  }

  const ins = await db().from("expenses").insert({
    spent_on: e.spentOn,
    category: e.category,
    description: e.description,
    amount_pence: e.amountPence,
    receipt_path: path,
  });
  if (ins.error) {
    if (path) await db().storage.from(RECEIPT_BUCKET).remove([path]);
    return unexpected("add expense", ins.error);
  }
  return OK;
}

/** Fills in the miles of a trip (one decimal, 0 to 9999.9). */
export async function setMiles(mileageId: string, miles: unknown): Promise<AdminResult> {
  const m = parseMiles(miles);
  if (m === null) return fail("Enter the miles as a number, like 12 or 12.5.");
  const res = await db().from("mileage").update({ miles: m }).eq("id", mileageId).select("id");
  if (res.error) return res.error.code === "22P02" ? fail("We could not find that trip.") : unexpected("set miles", res.error);
  if (!res.data?.length) return fail("We could not find that trip.");
  return OK;
}

/**
 * Records a refund of money already paid for a booking (ledger 'refund', today's
 * London date). It cannot exceed what was paid for that booking (its own
 * payments, its block's, or its Sunday bundle's) minus refunds already made.
 * A full refund of a single paid booking also marks it 'refunded'.
 */
export async function recordRefund(bookingId: string, amountText: unknown, opts: OpOptions = {}): Promise<AdminResult> {
  const pence = typeof amountText === "string" ? poundsToPence(amountText) : null;
  if (pence === null || pence <= 0) return fail("Enter the refund in pounds, like 25 or 12.50.");

  const b = await db().from("bookings").select("id, parent_id, bundle_id, block_booking_id, payment_status").eq("id", bookingId).maybeSingle();
  if (b.error) return b.error.code === "22P02" ? fail("We could not find that booking.") : unexpected("load booking", b.error);
  if (!b.data) return fail("We could not find that booking.");

  let ids = [bookingId];
  if (b.data.bundle_id) {
    const siblings = await db().from("bookings").select("id").eq("bundle_id", b.data.bundle_id);
    if (siblings.error) return unexpected("load bundle", siblings.error);
    ids = siblings.data.map((r) => r.id as string);
  }
  const ors = [`booking_id.in.(${ids.join(",")})`];
  if (b.data.block_booking_id) ors.push(`block_booking_id.eq.${b.data.block_booking_id}`);
  const led = await db().from("ledger").select("kind, amount_pence").or(ors.join(",")).in("kind", ["payment", "refund"]);
  if (led.error) return unexpected("load ledger", led.error);
  const paid = led.data.reduce((n, r) => n + (r.kind === "payment" ? r.amount_pence : -r.amount_pence), 0);
  if (paid <= 0) return fail("No payment has been recorded for this booking, so there is nothing to refund.");
  if (pence > paid) return fail("That is more than has been paid for this booking and not yet refunded.");

  const entry = await db().from("ledger").insert({
    booking_id: bookingId,
    parent_id: b.data.parent_id,
    kind: "refund",
    amount_pence: pence,
    occurred_on: londonDateOf(opts.now ?? new Date()),
    note: "Refund",
  });
  if (entry.error) return unexpected("write refund", entry.error);
  if (pence === paid && ids.length === 1 && !b.data.block_booking_id && b.data.payment_status === "paid") {
    await db().from("bookings").update({ payment_status: "refunded" }).eq("id", bookingId).eq("payment_status", "paid");
  }
  return OK;
}
