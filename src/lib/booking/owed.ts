import type { Booking, LedgerEntry } from "@/lib/types";
import { bookingFeePence, DEFAULT_LATE_FEE_PERCENT } from "./fees";

/**
 * Money a parent currently owes, from bookings still marked 'unpaid'.
 * Uses each booking's stored price and travel fee (never current settings).
 * A late cancellation owes the late cancellation fee (a percentage of the
 * price, no travel); a no-show owes the fee plus travel for a home visit;
 * attended and past confirmed lessons owe price plus travel. See `bookingFeePence`.
 * `ledger` is accepted for call-site symmetry but unused: payment_status on
 * each booking is authoritative (payments/credits/waivers update it).
 */
export function amountOwedPence(
  bookings: Booking[],
  _ledger: LedgerEntry[],
  now: Date,
  lateFeePercent: number = DEFAULT_LATE_FEE_PERCENT,
): number {
  let total = 0;
  for (const b of bookings) {
    if (b.paymentStatus !== "unpaid") continue;
    if (
      b.status === "late_cancelled" ||
      ((b.status === "no_show" || b.status === "attended" || b.status === "confirmed") &&
        b.startsAt.getTime() <= now.getTime())
    ) {
      total += bookingFeePence(b, lateFeePercent);
    }
  }
  return total;
}

/** True when late cancellations + no-shows in the last 365 days reach the threshold. */
export function isFlagged(bookings: Booking[], now: Date, threshold: number): boolean {
  const since = now.getTime() - 365 * 86400_000;
  const n = bookings.filter(
    (b) => (b.status === "late_cancelled" || b.status === "no_show") && b.startsAt.getTime() >= since,
  ).length;
  return n >= threshold;
}

/**
 * A family's credit (Ruling R23): credit issued (ledger 'credit', a paid
 * booking cancelled for free) minus credit already spent (ledger
 * 'credit_applied'). Payments, refunds and waivers do not count.
 */
export function creditBalancePence(ledger: Pick<LedgerEntry, "kind" | "amountPence" | "parentId">[], parentId: string): number {
  let n = 0;
  for (const l of ledger) {
    if (l.parentId !== parentId) continue;
    if (l.kind === "credit") n += l.amountPence;
    else if (l.kind === "credit_applied") n -= l.amountPence;
  }
  return n;
}
