import { TZDate } from "@date-fns/tz";
import { addMonths } from "date-fns";
import { formatLondon } from "@/lib/format";
import { LONDON } from "@/lib/time";
import type { Booking, Pass } from "@/lib/types";
import { inCoolingOff } from "./cancellation";
import { split } from "./pricing";

// Group passes (v2 spec §3). Pure: safe for client code and unit tests.

/** Seats that use up a session of the pass. Late-cancelled, no-show and cancelled seats give it back. */
export const PASS_USING_STATUSES = ["pending", "confirmed", "attended"] as const;

/** Sessions still on the pass: `sessionsTotal` minus this pass's pending, confirmed and attended seats. */
export function passRemaining(
  pass: Pick<Pass, "id" | "sessionsTotal">,
  seats: Pick<Booking, "status" | "passId">[],
): number {
  const used = seats.filter(
    (s) => s.passId === pass.id && (PASS_USING_STATUSES as readonly string[]).includes(s.status),
  ).length;
  return Math.max(0, pass.sessionsTotal - used);
}

/** The pass price split across its sessions; the remainder goes on the first session (Ruling R3). Sums to the price. */
export function passSessionValues(pass: Pick<Pass, "pricePence" | "sessionsTotal">): number[] {
  return split(pass.pricePence, pass.sessionsTotal);
}

/**
 * One session's value: `Math.floor(price / sessions)` (7900 / 6 = 1316). This
 * is the stored price of each seat booked with the pass and the basis of its
 * late cancellation / no-show fee. The few pence of remainder are not part of
 * any seat's price; they only count when the whole pass is untouched (see
 * `passUnusedValuePence`).
 */
export function passSessionValuePence(pass: Pick<Pass, "pricePence" | "sessionsTotal">): number {
  return Math.floor(pass.pricePence / pass.sessionsTotal);
}

/**
 * What `remaining` unused sessions are worth (for credit): the last
 * `remaining` parts of the split. Sessions are used first-to-last, so an
 * untouched pass is worth its whole price and each used session takes the
 * remainder-carrying first part first.
 */
export function passUnusedValuePence(pass: Pick<Pass, "pricePence" | "sessionsTotal">, remaining: number): number {
  const n = Math.max(0, Math.min(remaining, pass.sessionsTotal));
  if (n === 0) return 0;
  return passSessionValues(pass)
    .slice(-n)
    .reduce((a, b) => a + b, 0);
}

/** A pass can book sessions only once paid (status 'active') and before it expires. */
export function passUsable(pass: Pick<Pass, "status" | "expiresAt">, now: Date): boolean {
  return pass.status === "active" && pass.expiresAt !== null && now.getTime() < pass.expiresAt.getTime();
}

/** Expiry: `months` calendar months after payment, at the same London wall-clock time (end of month clamps). */
export function passExpiryFrom(paidAt: Date, months: number): Date {
  return new Date(addMonths(new TZDate(paidAt.getTime(), LONDON), months).getTime());
}

/** The 14-day cooling-off on a pass counts from when it was bought. */
export function passInCoolingOff(pass: Pick<Pass, "createdAt">, now: Date): boolean {
  return inCoolingOff(pass.createdAt, now);
}

/** A single session uses 1; a Sunday bundle (both Sunday sessions) uses 2 of a GCSE pass. */
export function sessionsNeeded(what: "session" | "sunday_bundle"): number {
  return what === "sunday_bundle" ? 2 : 1;
}

export const PASS_STATUS_LABEL: Record<Pass["status"], string> = {
  awaiting_payment: "awaiting payment",
  active: "active",
  expired: "expired",
  cancelled: "cancelled",
};

/** "KS3 group pass — 4 of 6 sessions left — expires 1 May 2027" (or "— awaiting payment" / "— expired"). */
export function passCardText(pass: Pick<Pass, "level" | "sessionsTotal" | "status" | "expiresAt">, remaining: number): string {
  const name = `${pass.level} group pass`;
  if (pass.status === "awaiting_payment" || pass.status === "cancelled") {
    return `${name} — ${pass.sessionsTotal} sessions — ${PASS_STATUS_LABEL[pass.status]}`;
  }
  const left = `${remaining} of ${pass.sessionsTotal} sessions left`;
  if (pass.status === "expired" || !pass.expiresAt) return `${name} — ${left} — expired`;
  return `${name} — ${left} — expires ${formatLondon(pass.expiresAt, "d MMMM yyyy")}`;
}
