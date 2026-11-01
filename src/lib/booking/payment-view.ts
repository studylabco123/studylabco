import type { BadgeTone } from "@/components/ui/Badge";
import type { Booking } from "@/lib/types";

/**
 * What the parent sees about paying for a booking (review I1, I3).
 * Pure: the booking page and the booking list share it.
 */

/**
 * What one seat costs if (or when) it is owed, from its stored prices
 * (Ruling R11): a late cancellation is the lesson price only; a cancelled or
 * declined booking costs nothing; anything else is price plus travel.
 */
export function seatDuePence(b: Pick<Booking, "status" | "pricePence" | "travelFeePence">): number {
  if (b.status === "cancelled" || b.status === "declined") return 0;
  return b.status === "late_cancelled" ? b.pricePence : b.pricePence + b.travelFeePence;
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

/**
 * The amount due on a held (unpaid) block: its price less the stored prices of
 * the weeks cancelled for free (status 'cancelled'). Late-cancelled weeks are
 * still charged (R11: their price is part of the block price). Never negative.
 */
export function blockDuePence(blockPricePence: number, seats: Pick<Booking, "status" | "pricePence">[]): number {
  const freed = seats.filter((s) => s.status === "cancelled").reduce((n, s) => n + s.pricePence, 0);
  return Math.max(0, blockPricePence - freed);
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
 * bundle or block siblings; `block` is the block it belongs to, if any.
 * - A held block owes its block price less free-cancelled weeks (I3).
 * - A paid block owes nothing.
 * - Otherwise (single booking, bundle, released block) each live seat owes
 *   its own amount while it is unpaid (R11, R16).
 */
export function bookingPaymentSummary(
  related: Booking[],
  block: { pricePence: number; status: "held" | "paid" | "released" | string } | null,
): PaymentSummary {
  const awaitingApproval = related.some((b) => b.status === "pending" && b.location === "home_visit");
  if (block && block.status === "held") {
    const due = blockDuePence(block.pricePence, related);
    return { totalPence: due, toPayPence: due, showHowToPay: due > 0, awaitingApproval };
  }
  if (block && block.status === "paid") {
    return { totalPence: block.pricePence, toPayPence: 0, showHowToPay: false, awaitingApproval };
  }
  const live = related.filter((b) => b.status !== "cancelled" && b.status !== "declined");
  const totalPence = live.reduce((n, b) => n + seatDuePence(b), 0);
  const toPayPence = live.filter(willBeOwed).reduce((n, b) => n + seatDuePence(b), 0);
  return { totalPence, toPayPence, showHowToPay: toPayPence > 0, awaitingApproval };
}
