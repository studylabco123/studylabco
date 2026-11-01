import type { Booking, LedgerEntry } from "@/lib/types";

/**
 * Money a parent currently owes, from bookings still marked 'unpaid'.
 * Uses each booking's stored price and travel fee (never current settings).
 * A late cancellation owes the lesson price only: the late cancellation fee
 * excludes travel (Ruling R11, spec 2.9). No-shows, attended and past
 * confirmed lessons owe price plus travel fee.
 * `ledger` is accepted for call-site symmetry but unused: payment_status on
 * each booking is authoritative (payments/credits/waivers update it).
 */
export function amountOwedPence(bookings: Booking[], _ledger: LedgerEntry[], now: Date): number {
  let total = 0;
  for (const b of bookings) {
    if (b.paymentStatus !== "unpaid") continue;
    if (b.status === "late_cancelled") {
      total += b.pricePence;
    } else if (
      (b.status === "no_show" || b.status === "attended" || b.status === "confirmed") &&
      b.startsAt.getTime() <= now.getTime()
    ) {
      total += b.pricePence + b.travelFeePence;
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
