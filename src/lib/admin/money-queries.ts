import "server-only";
import { amountOwedPence } from "@/lib/booking/owed";
import { getSettings } from "@/lib/settings";
import { buildTaxPack, type PackRange, type TaxPack } from "@/lib/money/tax-pack";
import { londonPeriods, taxYearFor } from "@/lib/money/tax-year";
import {
  mapBooking,
  mapExpense,
  mapLedger,
  mapMileage,
  type BookingRow,
  type ExpenseRowDb,
  type LedgerRow,
  type MileageRowDb,
} from "@/lib/supabase/mappers";
import { createServiceClient } from "@/lib/supabase/service";
import { addDays, londonDateOf } from "@/lib/time";
import type { Booking, Expense, MileageEntry } from "@/lib/types";
import { RECEIPT_BUCKET } from "./money-ops";
import { parentName } from "./queries";

/** Read side of the admin Money and Tax pages (service client; callers must have passed requireAdmin()). */

const db = () => createServiceClient();
const PAGE = 1000;

function check<T>(what: string, r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(`Could not load ${what}: ${r.error.message}`);
  return (r.data ?? []) as T;
}

/** All rows of a query, past the API's 1000-row page size. */
async function all<T>(what: string, page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const rows = check<T[]>(what, await page(from, from + PAGE - 1));
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}


/** The pack for a date range inside one tax year. Mileage is loaded from the start of that tax year so quarters continue the miles. */
export async function loadTaxPack(range: PackRange): Promise<TaxPack> {
  const c = db();
  const year = taxYearFor(range.start);
  const [ledger, expenses, mileage, bookings] = await Promise.all([
    all<LedgerRow>("ledger", (a, b) =>
      // From the start of time: settlements before the range decide what was unpaid at its end.
      c.from("ledger").select("*").lte("occurred_on", range.end).order("occurred_on").order("id").range(a, b),
    ),
    all<ExpenseRowDb>("expenses", (a, b) =>
      c.from("expenses").select("*").gte("spent_on", range.start).lte("spent_on", range.end).order("spent_on").order("id").range(a, b),
    ),
    all<MileageRowDb>("mileage", (a, b) =>
      c.from("mileage").select("*").gte("trip_on", year.start).lte("trip_on", range.end).order("trip_on").order("id").range(a, b),
    ),
    all<BookingRow>("bookings", (a, b) =>
      // Every booking that existed by the range end, whatever its status today (it may have been paid since).
      c.from("bookings").select("*").lte("created_at", `${addDays(range.end, 1)}T00:00:00Z`).or(`starts_at.lte.${addDays(range.end, 1)}T00:00:00Z,cancelled_at.lte.${addDays(range.end, 1)}T00:00:00Z`).order("id").range(a, b),
    ),
  ]);
  const ids = [...new Set([...ledger.map((l) => l.parent_id), ...bookings.map((b) => b.parent_id)].filter((i): i is string => !!i))];
  const names = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const rows = check<{ id: string; full_name: string; email: string }[]>(
      "profiles",
      await c.from("profiles").select("id, full_name, email").in("id", ids.slice(i, i + 200)),
    );
    for (const p of rows) names.set(p.id, parentName({ ...p, phone: null, is_blocked: false }));
  }
  return buildTaxPack(
    range,
    ledger.map(mapLedger),
    bookings.map(mapBooking),
    expenses.map(mapExpense),
    mileage.map(mapMileage),
    names,
    (await getSettings()).lateFeePercent,
  );
}

export interface OutstandingItem {
  bookingId: string;
  parentId: string | null;
  parentName: string;
  childName: string;
  startsAt: Date;
  owedPence: number;
}
export interface RefundableBooking {
  id: string;
  label: string;
}
export interface MoneyData {
  today: string;
  outstanding: OutstandingItem[];
  outstandingTotalPence: number;
  income: { week: number; month: number; year: number };
  expenses: (Expense & { receiptUrl: string | null })[];
  trips: MileageEntry[];
  refundable: RefundableBooking[];
}

const net = (rows: LedgerRow[], start: string, end: string) =>
  rows
    .filter((l) => l.occurred_on >= start && l.occurred_on <= end)
    .reduce((n, l) => n + (l.kind === "payment" ? l.amount_pence : l.kind === "refund" ? -l.amount_pence : 0), 0);

export async function loadMoney(now: Date = new Date()): Promise<MoneyData> {
  const c = db();
  const today = londonDateOf(now);
  const p = londonPeriods(today);
  const earliest = [p.week.start, p.month.start, p.year.start].sort()[0];
  const [ledger, unpaidRows, expenseRows, tripRows, paidRows] = await Promise.all([
    all<LedgerRow>("ledger", (a, b) =>
      c.from("ledger").select("*").in("kind", ["payment", "refund"]).gte("occurred_on", earliest).order("id").range(a, b),
    ),
    all<BookingRow>("bookings", (a, b) => c.from("bookings").select("*").eq("payment_status", "unpaid").order("starts_at").range(a, b)),
    c.from("expenses").select("*").order("spent_on", { ascending: false }).order("created_at", { ascending: false }).limit(30),
    c.from("mileage").select("*").order("trip_on", { ascending: false }).order("created_at", { ascending: false }).limit(60),
    // Paid bookings, and credited ones (refunding a credit uses it up, R23).
    c.from("bookings").select("*").in("payment_status", ["paid", "credited"]).order("starts_at", { ascending: false }).limit(40),
  ]);

  const { lateFeePercent } = await getSettings();
  const owed: Booking[] = unpaidRows.map(mapBooking).filter((b) => amountOwedPence([b], [], now, lateFeePercent) > 0);
  const paid = check<BookingRow[]>("paid bookings", paidRows).map(mapBooking);
  const parentIds = [...owed, ...paid].map((b) => b.parentId);
  const childIds = [...owed, ...paid].map((b) => b.childId);
  const [parents, children] = await Promise.all([lookup("profiles", "id, full_name, email", parentIds), lookup("children", "id, first_name, last_name", childIds)]);
  const pName = (id: string | null) => (id && parents.get(id) ? parentName({ ...(parents.get(id) as { id: string; full_name: string; email: string }), phone: null, is_blocked: false }) : "Unknown parent");
  const cName = (id: string | null) => {
    const ch = id ? (children.get(id) as { first_name: string; last_name: string } | undefined) : undefined;
    return ch ? `${ch.first_name} ${ch.last_name}` : "Unknown child";
  };

  const outstanding = owed.map<OutstandingItem>((b) => ({
    bookingId: b.id,
    parentId: b.parentId,
    parentName: pName(b.parentId),
    childName: cName(b.childId),
    startsAt: b.startsAt,
    owedPence: amountOwedPence([b], [], now, lateFeePercent),
  }));

  const expenses = await Promise.all(
    check<ExpenseRowDb[]>("expenses", expenseRows).map(async (r) => {
      const e = mapExpense(r);
      return { ...e, receiptUrl: e.receiptPath ? await signedReceiptUrl(e.receiptPath) : null };
    }),
  );

  return {
    today,
    outstanding,
    outstandingTotalPence: outstanding.reduce((n, o) => n + o.owedPence, 0),
    income: { week: net(ledger, p.week.start, p.week.end), month: net(ledger, p.month.start, p.month.end), year: net(ledger, p.year.start, p.year.end) },
    expenses,
    trips: check<MileageRowDb[]>("mileage", tripRows).map(mapMileage),
    refundable: paid.map((b) => ({
      id: b.id,
      label: `${pName(b.parentId)} - ${cName(b.childId)} - ${londonDateOf(b.startsAt)}${b.paymentStatus === "credited" ? " (held as credit)" : ""}`,
    })),
  };
}

async function lookup(table: "profiles" | "children", cols: string, ids: (string | null)[]): Promise<Map<string, Record<string, unknown>>> {
  const unique = [...new Set(ids.filter((i): i is string => !!i))];
  const out = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < unique.length; i += 200) {
    const rows = check<Record<string, unknown>[]>(
      table,
      (await db().from(table).select(cols).in("id", unique.slice(i, i + 200))) as unknown as { data: Record<string, unknown>[] | null; error: { message: string } | null },
    );
    for (const r of rows) out.set(r.id as string, r);
  }
  return out;
}

/** A link to a receipt that stops working after 5 minutes. Receipts are never public. */
async function signedReceiptUrl(path: string): Promise<string | null> {
  const res = await db().storage.from(RECEIPT_BUCKET).createSignedUrl(path, 300);
  return res.error ? null : res.data.signedUrl;
}
