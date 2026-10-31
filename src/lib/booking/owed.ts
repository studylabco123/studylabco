import type { Booking, LedgerEntry } from "@/lib/types";

/**
 * Money a parent currently owes, from bookings still marked 'unpaid'.
 * Uses each booking's stored price and travel fee (never current settings).
 * `ledger` is accepted for call-site symmetry but unused: payment_status on
 * each booking is authoritative (payments/credits/waivers update it).
 */
export function amountOwedPence(bookings: Booking[], _ledger: LedgerEntry[], now: Date): number {
  let total = 0;
  for (const b of bookings) {
    if (b.paymentStatus !== "unpaid") continue;
    const counts =
      b.status === "late_cancelled" ||
      ((b.status === "no_show" || b.status === "attended" || b.status === "confirmed") &&
        b.startsAt.getTime() <= now.getTime());
    if (counts) total += b.pricePence + b.travelFeePence;
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
