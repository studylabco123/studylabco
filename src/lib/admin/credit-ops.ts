import "server-only";
import { formatPence } from "@/lib/format";
import { ADJUSTMENT_NOTE } from "@/lib/money/tax-pack";
import { createServiceClient } from "@/lib/supabase/service";
import { londonDateOf } from "@/lib/time";
import type { PaymentMethod } from "@/lib/types";
import { fail, OK, unexpected, type AdminResult, type OpOptions } from "./result";

// Credit administration (V6). Callers (server actions) must have passed requireAdmin().
// Credit is never income: adjustments are ledger 'credit' / 'credit_applied' rows and are
// listed (not counted) in the tax pack. Spending credit always goes through a locked RPC
// (per-parent advisory lock), so concurrent removals cannot overspend the balance.

const db = () => createServiceClient();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METHODS: readonly string[] = ["bank_transfer", "cash"];
export const REASON_MAX = 200;
/** A single adjustment is capped at £999,999.99 (the pounds input takes six digits). */
const MAX_PENCE = 99_999_999;

const tooMuch = (balance: number) => fail(`That's more than the ${formatPence(balance)} credit on this account.`);

async function parentExists(parentId: string): Promise<AdminResult> {
  const { data, error } = await db().from("profiles").select("id").eq("id", parentId).eq("role", "parent").maybeSingle();
  if (error) return unexpected("load parent", error);
  return data ? OK : fail("We could not find that family.");
}

async function balanceOf(parentId: string): Promise<number> {
  const { data, error } = await db().rpc("credit_balance", { p_parent: parentId });
  if (error) throw new Error(`Could not load credit: ${error.message}`);
  return typeof data === "number" ? data : 0;
}

function checkAmount(pence: unknown): AdminResult {
  if (typeof pence !== "number" || !Number.isInteger(pence) || pence <= 0 || pence > MAX_PENCE) {
    return fail("Enter an amount in pounds, like 5 or 12.50.");
  }
  return OK;
}

/**
 * Adds to or removes from a family's credit. 'add' writes a ledger 'credit' with a note;
 * 'remove' writes a 'credit_applied' through apply_credit, which locks the balance and is
 * refused above it. The reason is required (1 to 200 characters) and kept in the ledger note;
 * the row is dated today in London.
 */
export async function adjustCredit(
  parentId: string,
  amountPence: number,
  direction: "add" | "remove",
  reason: string,
  opts: OpOptions = {},
): Promise<AdminResult> {
  if (typeof parentId !== "string" || !UUID.test(parentId)) return fail("We could not find that family.");
  const amount = checkAmount(amountPence);
  if (!amount.ok) return amount;
  if (direction !== "add" && direction !== "remove") return fail("Choose whether to add or remove credit.");
  const why = typeof reason === "string" ? reason.trim() : "";
  if (!why) return fail("Give a reason for the adjustment.");
  if (why.length > REASON_MAX) return fail(`Keep the reason to ${REASON_MAX} characters or fewer.`);
  const known = await parentExists(parentId);
  if (!known.ok) return known;

  const on = londonDateOf(opts.now ?? new Date());
  const note = `${ADJUSTMENT_NOTE}: ${why}`;
  try {
    if (direction === "add") {
      const ins = await db().from("ledger").insert({ parent_id: parentId, kind: "credit", amount_pence: amountPence, occurred_on: on, note });
      return ins.error ? unexpected("add credit", ins.error) : OK;
    }
    const res = await db().rpc("apply_credit", {
      p_parent: parentId,
      p_amount: amountPence,
      p_booking: null,
      p_block: null,
      p_on: on,
      p_note: note,
    });
    if (res.error) return unexpected("remove credit", res.error);
    if (typeof res.data !== "number" || res.data < 0) return tooMuch(await balanceOf(parentId));
    return OK;
  } catch (err) {
    console.error("admin: adjust credit failed", err);
    return fail("Something went wrong. Please try again.");
  }
}

/**
 * Refunds credit to the family (the tutor has paid it back by bank transfer or cash): one
 * ledger 'refund' and one 'credit_applied' for the same amount, written together under the
 * credit lock by refund_credit, so the balance and turnover both go down. Capped at the balance.
 */
export async function refundCredit(
  parentId: string,
  amountPence: number,
  method: PaymentMethod,
  opts: OpOptions = {},
): Promise<AdminResult> {
  if (typeof parentId !== "string" || !UUID.test(parentId)) return fail("We could not find that family.");
  const amount = checkAmount(amountPence);
  if (!amount.ok) return amount;
  if (!METHODS.includes(method)) return fail("Choose how the refund was paid.");
  const known = await parentExists(parentId);
  if (!known.ok) return known;

  try {
    const res = await db().rpc("refund_credit", {
      p_parent: parentId,
      p_amount: amountPence,
      p_method: method,
      p_on: londonDateOf(opts.now ?? new Date()),
      p_note: "Credit refunded",
    });
    if (res.error) return unexpected("refund credit", res.error);
    if (typeof res.data !== "number" || res.data < 0) return tooMuch(await balanceOf(parentId));
    return OK;
  } catch (err) {
    console.error("admin: refund credit failed", err);
    return fail("Something went wrong. Please try again.");
  }
}
