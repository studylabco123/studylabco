import "server-only";
import { randomUUID } from "node:crypto";
import { formatPence } from "@/lib/format";
import { createServiceClient } from "@/lib/supabase/service";
import { londonDateOf } from "@/lib/time";
import { checkReceipt, parseExpense, parseMiles, RECEIPT_PATH } from "@/lib/money/validation";
import { poundsToPence } from "./settings-validation";
import { fail, OK, unexpected, type AdminResult, type Failure, type OpOptions } from "./result";

const db = () => createServiceClient();
export const RECEIPT_BUCKET = "receipts";

export interface ExpenseForm {
  date: unknown;
  category: unknown;
  description: unknown;
  amount: unknown;
  /** Object key from prepareReceiptUpload, once the browser has uploaded the file. */
  receiptPath?: unknown;
}

export type UploadTicket = { ok: true; path: string; token: string } | Failure;

/**
 * Step 1 of a receipt: checks the file's declared type and size and returns a
 * one-off signed upload URL token for receipts/YYYY/<uuid>.<ext>, so the file
 * goes from the browser straight to storage (not through a server action).
 */
export async function prepareReceiptUpload(type: unknown, size: unknown, spentOn: unknown): Promise<UploadTicket> {
  const checked = checkReceipt({ size: typeof size === "number" ? size : 0, type: typeof type === "string" ? type : "" });
  if (!checked.ok) return fail(checked.message);
  const year = typeof spentOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(spentOn) ? spentOn.slice(0, 4) : null;
  if (!year) return fail("Choose the date you spent the money.");
  const path = `receipts/${year}/${randomUUID()}.${checked.value.ext}`;
  const res = await db().storage.from(RECEIPT_BUCKET).createSignedUploadUrl(path);
  if (res.error) return unexpected("prepare receipt upload", res.error);
  return { ok: true, path, token: res.data.token };
}

/**
 * Step 2: records the expense. A receipt must be an object the browser already
 * uploaded to a receipts/YYYY/<uuid>.<ext> key; its size and type are read back
 * from storage (never trusted from the browser) and an invalid object is deleted.
 * If the row cannot be saved the object is removed again.
 */
export async function addExpense(form: ExpenseForm, opts: OpOptions = {}): Promise<AdminResult> {
  const parsed = parseExpense(form, londonDateOf(opts.now ?? new Date()));
  if (!parsed.ok) return fail(parsed.message);
  const e = parsed.value;

  let path: string | null = null;
  if (form.receiptPath !== undefined && form.receiptPath !== null && form.receiptPath !== "") {
    if (typeof form.receiptPath !== "string" || !RECEIPT_PATH.test(form.receiptPath)) return fail("That receipt could not be used. Please upload it again.");
    path = form.receiptPath;
    const info = await db().storage.from(RECEIPT_BUCKET).info(path);
    if (info.error || !info.data) return fail("The receipt did not upload. Please try again.");
    const checked = checkReceipt({ size: info.data.size ?? 0, type: info.data.contentType ?? "" });
    if (!checked.ok) {
      await db().storage.from(RECEIPT_BUCKET).remove([path]);
      return fail(checked.message);
    }
    const taken = await db().from("expenses").select("id").eq("receipt_path", path).limit(1);
    if (taken.error) return unexpected("check receipt", taken.error);
    if (taken.data.length) return fail("That receipt is already attached to an expense.");
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
 * A full refund of a single paid booking also marks it 'refunded'. Refunding
 * a credited booking also uses up that much of the family's credit
 * ('credit_applied', Ruling R23), and is refused beyond the credit left.
 */
export async function recordRefund(bookingId: string, amountText: unknown, opts: OpOptions = {}): Promise<AdminResult> {
  const pence = typeof amountText === "string" ? poundsToPence(amountText) : null;
  if (pence === null || pence <= 0) return fail("Enter the refund in pounds, like 25 or 12.50.");

  const b = await db().from("bookings").select("id, parent_id, bundle_id, block_booking_id, payment_status").eq("id", bookingId).maybeSingle();
  if (b.error) return b.error.code === "22P02" ? fail("We could not find that booking.") : unexpected("load booking", b.error);
  if (!b.data) return fail("We could not find that booking.");

  // Everything that shares the money: the booking, its Sunday bundle and its block (a block is paid once for all sessions).
  const ids = new Set([bookingId]);
  const sharers = [
    b.data.bundle_id ? await db().from("bookings").select("id").eq("bundle_id", b.data.bundle_id) : null,
    b.data.block_booking_id ? await db().from("bookings").select("id").eq("block_booking_id", b.data.block_booking_id) : null,
  ];
  for (const r of sharers) {
    if (r?.error) return unexpected("load related bookings", r.error);
    for (const row of r?.data ?? []) ids.add(row.id as string);
  }
  const ors = [`booking_id.in.(${[...ids].join(",")})`];
  if (b.data.block_booking_id) ors.push(`block_booking_id.eq.${b.data.block_booking_id}`);
  const led = await db().from("ledger").select("kind, amount_pence").or(ors.join(",")).in("kind", ["payment", "refund"]);
  if (led.error) return unexpected("load ledger", led.error);
  const paid = led.data.reduce((n, r) => n + (r.kind === "payment" ? r.amount_pence : -r.amount_pence), 0);
  if (paid <= 0) return fail("No payment has been recorded for this booking, so there is nothing to refund.");
  if (pence > paid) return fail("That is more than has been paid for this booking and not yet refunded.");

  // A credited booking's money is held as family credit (Ruling R23): refunding it uses that credit up,
  // so the same money cannot also pay a later lesson.
  const credited = b.data.payment_status === "credited";
  const on = londonDateOf(opts.now ?? new Date());
  if (credited) {
    if (!b.data.parent_id) return fail("This booking has no family account any more, so its credit cannot be refunded here.");
    const bal = await db().rpc("credit_balance", { p_parent: b.data.parent_id });
    if (bal.error) return unexpected("load credit", bal.error);
    const balance = typeof bal.data === "number" ? bal.data : 0;
    if (pence > balance) {
      return fail(`This family has ${formatPence(balance)} of credit left, so at most that much of this credit can be refunded.`);
    }
  }

  const entry = await db()
    .from("ledger")
    .insert({
      booking_id: bookingId,
      block_booking_id: b.data.block_booking_id,
      parent_id: b.data.parent_id,
      kind: "refund",
      amount_pence: pence,
      occurred_on: on,
      note: "Refund",
    })
    .select("id")
    .single();
  if (entry.error) return unexpected("write refund", entry.error);
  if (credited) {
    const used = await db().rpc("apply_credit", {
      p_parent: b.data.parent_id,
      p_amount: pence,
      p_booking: bookingId,
      p_block: null,
      p_on: on,
      p_note: "Refunded instead of kept as credit",
    });
    if (used.error || typeof used.data !== "number" || used.data < 0) {
      await db().from("ledger").delete().eq("id", entry.data.id as string);
      return used.error ? unexpected("use credit for refund", used.error) : fail("This family's credit was just used. Please refresh and check.");
    }
  }
  if (pence === paid && ids.size === 1 && !b.data.block_booking_id && (b.data.payment_status === "paid" || credited)) {
    await db().from("bookings").update({ payment_status: "refunded" }).eq("id", bookingId).eq("payment_status", b.data.payment_status);
  }
  return OK;
}
