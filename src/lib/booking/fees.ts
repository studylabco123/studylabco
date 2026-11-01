import type { Booking } from "@/lib/types";

/** The default late cancellation fee, as a percentage of the lesson price. */
export const DEFAULT_LATE_FEE_PERCENT = 50;

/** The late cancellation fee: a share of the lesson price, never travel. */
export function lateFeePence(pricePence: number, percent: number): number {
  return Math.round((pricePence * percent) / 100);
}

/**
 * What a booking owes if unpaid, from its stored prices. A stored `feePence`
 * (set when the fee is changed or removed) overrides the computed fee.
 * - late cancelled: the late cancellation fee (no travel)
 * - no-show: the fee plus travel for a home visit
 * - attended or confirmed: price plus travel
 */
export function bookingFeePence(
  b: Pick<Booking, "status" | "location" | "pricePence" | "travelFeePence" | "feePence">,
  percent: number,
): number {
  const fee = b.feePence ?? lateFeePence(b.pricePence, percent);
  const travel = b.location === "home_visit" ? b.travelFeePence : 0;
  if (b.status === "late_cancelled") return fee;
  if (b.status === "no_show") return fee + travel;
  return b.pricePence + b.travelFeePence;
}
