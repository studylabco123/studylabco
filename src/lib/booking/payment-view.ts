import type { BadgeTone } from "@/components/ui/Badge";
import type { Booking } from "@/lib/types";
import { bookingFeePence, DEFAULT_LATE_FEE_PERCENT } from "./fees";

/**
 * What the parent sees about paying for a booking (review I1, I3).
 * Pure: the booking page and the booking list share it.
 */

/**
 * What one seat costs if (or when) it is owed, from its stored prices: a late
 * cancellation is the late cancellation fee (no travel); a no-show is the fee
 * plus travel for a home visit; a cancelled or declined booking costs nothing;
 * anything else is price plus travel.
 */
export function seatDuePence(
  b: Pick<Booking, "status" | "location" | "pricePence" | "travelFeePence" | "feePence">,
  lateFeePercent: number = DEFAULT_LATE_FEE_PERCENT,
): number {
  if (b.status === "cancelled" || b.status === "declined") return 0;
  return bookingFeePence(b, lateFeePercent);
}

/**
 * Unpaid and owed now or later: confirmed (before or after the lesson),
 * attended, missed, late cancelled, or pending anywhere but a home visit (a
 * pending home visit is waiting for the tutor, so nothing is asked yet).
 */
export function willBeOwed(b: Pick<Booking, "status" | "location" | "paymentStatus">): boolean {
  if (b.paymentStatus !== "unpaid") return false;
  switch (b.status) {
    case "confirmed":
    case "attended":
    case "no_show":
    case "late_cancelled":
      return true;
    case "pending":
      return b.location !== "home_visit";
    default:
      return false;
  }
}

/** The payment badge for one booking, or null when nothing is or will be owed and nothing was paid. */
export function paymentBadge(b: Pick<Booking, "status" | "location" | "paymentStatus">): { text: string; tone: BadgeTone } | null {
  switch (b.paymentStatus) {
    case "paid":
      return { text: "Paid", tone: "success" };
    case "credited":
      return { text: "Credited", tone: "sky" };
    case "refunded":
      return { text: "Refunded", tone: "neutral" };
    case "waived":
      return { text: "Waived", tone: "neutral" };
    case "unpaid":
      return willBeOwed(b) ? { text: "Unpaid", tone: "warning" } : null;
  }
}

export interface PaymentSummary {
  /** The price of what is (still) booked: cancelled and declined seats left out. */
  totalPence: number;
  /** What the parent should pay now or before the lesson; 0 when nothing is asked. */
  toPayPence: number;
  /** Show the "How to pay" card (bank details) only while something is owed or will be owed. */
  showHowToPay: boolean;
  /** A home visit waiting for the tutor's decision: nothing is asked yet. */
  awaitingApproval: boolean;
}

/**
 * The money on one booking page. `related` is the booking with its Sunday
 * bundle sibling. Each live seat owes its own amount while it is unpaid
 * (R11, R16). A seat booked with a group pass is paid by the pass, so it
 * asks for nothing unless a late cancellation / no-show fee is owed.
 */
export function bookingPaymentSummary(related: Booking[], lateFeePercent: number = DEFAULT_LATE_FEE_PERCENT): PaymentSummary {
  const awaitingApproval = related.some((b) => b.status === "pending" && b.location === "home_visit");
  const live = related.filter((b) => b.status !== "cancelled" && b.status !== "declined");
  const totalPence = live.reduce((n, b) => n + seatDuePence(b, lateFeePercent), 0);
  const toPayPence = live.filter(willBeOwed).reduce((n, b) => n + seatDuePence(b, lateFeePercent), 0);
  return { totalPence, toPayPence, showHowToPay: toPayPence > 0, awaitingApproval };
}
