import { DEFAULT_LATE_FEE_PERCENT } from "@/lib/booking/fees";
import { amountOwedPence } from "@/lib/booking/owed";
import { categoryLabel } from "@/lib/money/categories";
import { mileageAllowancePence, taxYearFor, type DateSpan } from "@/lib/money/tax-year";
import { londonDateOf, londonDateTime } from "@/lib/time";
import type { Booking, Expense, LedgerEntry, MileageEntry } from "@/lib/types";

/** The date span a pack covers, with the tax year it belongs to (mileage rates are per tax year). */
export interface PackRange extends DateSpan {
  label: string;
  /** The quarter (1-4) when the pack covers one, for titles and filenames. */
  q?: 1 | 2 | 3 | 4 | null;
}

export interface Row {
  date: string;
  label: string;
  detail: string;
  amountPence: number;
}
export interface IncomeRow extends Row {
  method: string;
}
export interface MonthlyRow {
  month: string;
  turnoverPence: number;
  expensesPence: number;
  mileagePence: number;
  profitPence: number;
}
export interface ExpenseRow {
  date: string;
  category: string;
  description: string;
  amountPence: number;
  receipt: boolean;
}
export interface MileageRow {
  date: string;
  miles: number | null;
  amountPence: number;
  note: string;
}

export interface TaxPack {
  range: PackRange;
  summary: {
    turnoverPence: number;
    expensesPence: number;
    mileagePence: number;
    allowableTotalPence: number;
    profitPence: number;
    tradingAllowanceBetter: boolean;
  };
  income: IncomeRow[];
  monthly: MonthlyRow[];
  expenses: ExpenseRow[];
  mileage: MileageRow[];
  refundsAndWaivers: Row[];
  unpaidAtEnd: Row[];
  /** Trips in the range with no miles entered (they count as nothing until filled in). */
  missingMilesCount: number;
}

/** Notes on ledger rows written by a tutor's credit adjustment start with this (V6); sheet 6 labels them. */
export const ADJUSTMENT_NOTE = "Tutor adjustment";

/** The £1,000 trading allowance, in pence. */
export const TRADING_ALLOWANCE_PENCE = 100_000;

const inRange = (date: string, r: DateSpan) => date >= r.start && date <= r.end;
const byDate = <T extends { date: string }>(rows: T[]) => rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

/**
 * Builds the figures for a tax year or quarter. Cash basis: income is ledger
 * payments minus refunds dated (occurred_on) inside the range. Credits issued,
 * credits applied and waivers are not income; they are listed with refunds. Everything is pence.
 * `mileage` should hold the whole tax year so a quarter continues the
 * cumulative miles of the quarters before it.
 */
export function buildTaxPack(
  range: PackRange,
  ledger: LedgerEntry[],
  bookings: Booking[],
  expenses: Expense[],
  mileage: MileageEntry[],
  parentNames: ReadonlyMap<string, string> = new Map(),
  lateFeePercent: number = DEFAULT_LATE_FEE_PERCENT,
): TaxPack {
  const who = (id: string | null) => (id ? (parentNames.get(id) ?? "") : "");
  // A group-pass row always says so, even if its note was cleared (account deletion clears notes).
  const passTag = (l: LedgerEntry) => (l.passId && !l.note.includes("Group pass") ? "Group pass" : "");
  const detailOf = (l: LedgerEntry) => [who(l.parentId), passTag(l), l.note].filter(Boolean).join(" · ");

  const live = ledger.filter((l) => inRange(l.occurredOn, range));
  const payments = live.filter((l) => l.kind === "payment");
  const refunds = live.filter((l) => l.kind === "refund");
  const turnoverPence = payments.reduce((n, l) => n + l.amountPence, 0) - refunds.reduce((n, l) => n + l.amountPence, 0);

  const income = byDate(
    payments.map<IncomeRow>((l) => ({
      date: l.occurredOn,
      // A group pass is income on the day it is paid; its sessions are not income again.
      label: l.passId ? "Group pass" : "Payment",
      detail: detailOf(l),
      method: l.method === "bank_transfer" ? "Bank transfer" : l.method === "cash" ? "Cash" : "",
      amountPence: l.amountPence,
    })),
  );

  // Credits (issued when a paid lesson is cancelled for free, applied when they pay a later one) are
  // listed for the record but are never turnover: the money was counted when it was first paid (R23).
  const LABELS = { refund: "Refund", credit: "Credit issued", credit_applied: "Credit applied", waiver: "Waived fee" } as const;
  const refundsAndWaivers = byDate(
    live
      .filter((l) => l.kind !== "payment")
      .map<Row>((l) => ({
        date: l.occurredOn,
        label:
          (l.kind === "credit" || l.kind === "credit_applied") && l.note.startsWith(ADJUSTMENT_NOTE)
            ? l.kind === "credit"
              ? "Credit added by tutor"
              : "Credit removed by tutor"
            : LABELS[l.kind as keyof typeof LABELS],
        detail: detailOf(l),
        amountPence: l.amountPence,
      })),
  );

  const expenseRows = byDate(
    expenses
      .filter((e) => inRange(e.spentOn, range))
      .map<ExpenseRow>((e) => ({
        date: e.spentOn,
        category: categoryLabel(e.category),
        description: e.description,
        amountPence: e.amountPence,
        receipt: !!e.receiptPath,
      })),
  );
  const expensesPence = expenseRows.reduce((n, e) => n + e.amountPence, 0);

  // Mileage: rates apply to cumulative miles across the tax year, in date order.
  const yearStart = taxYearFor(range.start).start;
  const sortedTrips = [...mileage].sort((a, b) => (a.tripOn < b.tripOn ? -1 : a.tripOn > b.tripOn ? 1 : 0));
  let cumulative = sortedTrips
    .filter((t) => t.tripOn >= yearStart && t.tripOn < range.start)
    .reduce((n, t) => n + (t.miles ?? 0), 0);
  const mileageRows: MileageRow[] = [];
  for (const t of sortedTrips.filter((x) => inRange(x.tripOn, range))) {
    if (t.miles === null) {
      mileageRows.push({ date: t.tripOn, miles: null, amountPence: 0, note: [t.note, "miles not entered"].filter(Boolean).join(" · ") });
      continue;
    }
    const before = mileageAllowancePence(cumulative);
    cumulative += t.miles;
    mileageRows.push({ date: t.tripOn, miles: t.miles, amountPence: mileageAllowancePence(cumulative) - before, note: t.note });
  }
  const mileagePence = mileageRows.reduce((n, m) => n + m.amountPence, 0);

  const allowableTotalPence = expensesPence + mileagePence;

  // Monthly breakdown by calendar month (the first and last months are part months in a tax year).
  const monthly: MonthlyRow[] = [];
  const [sy, sm] = range.start.split("-").map(Number);
  const [ey, em] = range.end.split("-").map(Number);
  for (let y = sy, m = sm; y < ey || (y === ey && m <= em); m === 12 ? ((y += 1), (m = 1)) : (m += 1)) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const sum = (rows: { date: string; amountPence: number }[]) =>
      rows.filter((r) => r.date.startsWith(key)).reduce((n, r) => n + r.amountPence, 0);
    const t = sum(payments.map((l) => ({ date: l.occurredOn, amountPence: l.amountPence }))) -
      sum(refunds.map((l) => ({ date: l.occurredOn, amountPence: l.amountPence })));
    const e = sum(expenseRows);
    const mi = sum(mileageRows);
    monthly.push({ month: key, turnoverPence: t, expensesPence: e, mileagePence: mi, profitPence: t - e - mi });
  }

  // Unpaid at the end of the range: owed by the same rules as everywhere else (late cancellation: price
  // only), and no payment, waiver or credit dated on or before the end covers it (its own, its Sunday
  // bundle's). Today's payment_status is deliberately ignored: it may have changed since. A session
  // booked with a group pass was paid by the pass; only its late cancellation / no-show fee can be owed.
  const endInstant = londonDateTime(range.end, "23:59:59");
  const settled = ledger.filter((l) => l.kind !== "refund" && l.occurredOn <= range.end);
  const settledBookings = new Set(settled.map((l) => l.bookingId).filter((i): i is string => !!i));
  const bundleMembers = new Map<string, string[]>();
  for (const b of bookings) if (b.bundleId) bundleMembers.set(b.bundleId, [...(bundleMembers.get(b.bundleId) ?? []), b.id]);
  const isSettled = (b: Booking) =>
    settledBookings.has(b.id) ||
    (b.passId !== null && b.status !== "late_cancelled" && b.status !== "no_show") ||
    (b.bundleId !== null && (bundleMembers.get(b.bundleId) ?? []).some((id) => settledBookings.has(id)));
  const unpaidAtEnd = byDate(
    bookings
      .filter((b) => b.createdAt.getTime() <= endInstant.getTime())
      // A late-cancellation fee arises when the booking is cancelled; anything else when the lesson starts.
      .filter((b) => (b.status === "late_cancelled" ? (b.cancelledAt ?? b.startsAt) : b.startsAt).getTime() <= endInstant.getTime())
      .filter((b) => !isSettled(b))
      .map((b) => ({ b, owed: amountOwedPence([{ ...b, paymentStatus: "unpaid" }], [], endInstant, lateFeePercent) }))
      .filter((x) => x.owed > 0)
      .map<Row>(({ b, owed }) => ({
        date: londonDateOf(b.startsAt),
        label: b.status === "late_cancelled" ? "Late cancellation" : "Lesson",
        detail: who(b.parentId),
        amountPence: owed,
      })),
  );

  return {
    range,
    summary: {
      turnoverPence,
      expensesPence,
      mileagePence,
      allowableTotalPence,
      profitPence: turnoverPence - allowableTotalPence,
      tradingAllowanceBetter: allowableTotalPence < TRADING_ALLOWANCE_PENCE,
    },
    income,
    monthly,
    expenses: expenseRows,
    mileage: mileageRows,
    refundsAndWaivers,
    unpaidAtEnd,
    missingMilesCount: mileageRows.filter((m) => m.miles === null).length,
  };
}
