/**
 * Cancellation rules (spec §2.9 and Ruling R20).
 *
 * - The tutor cancelling is always free.
 * - A parent cancelling at least `noticeHours` before the lesson is free.
 * - A parent cancelling within 14 days of making the booking is free whatever
 *   the notice (the Consumer Contracts Regulations 2013 cooling-off period,
 *   read conservatively). For a block, "making the booking" is the block's
 *   created_at; for a bundle, its bookings' created_at.
 * - Otherwise the cancellation is late and the late cancellation fee is due.
 */
export const COOLING_OFF_DAYS = 14;
const DAY = 86_400_000;

export type CancellationReason = "tutor" | "notice" | "cooling_off" | "late";

/** True while `now` is no more than 14 days after the booking was made (inclusive). */
export function inCoolingOff(bookedAt: Date, now: Date): boolean {
  return now.getTime() - bookedAt.getTime() <= COOLING_OFF_DAYS * DAY;
}

export function cancellationDecision(
  startsAt: Date,
  now: Date,
  noticeHours: number,
  by: "parent" | "tutor",
  bookedAt?: Date,
): { outcome: "free" | "late"; reason: CancellationReason } {
  if (by === "tutor") return { outcome: "free", reason: "tutor" };
  if (startsAt.getTime() - now.getTime() >= noticeHours * 3600_000) return { outcome: "free", reason: "notice" };
  if (bookedAt && inCoolingOff(bookedAt, now)) return { outcome: "free", reason: "cooling_off" };
  return { outcome: "late", reason: "late" };
}

/** 'free' or 'late'. Pass `bookedAt` so the 14-day cooling-off applies. */
export function cancellationOutcome(
  startsAt: Date,
  now: Date,
  noticeHours: number,
  by: "parent" | "tutor",
  bookedAt?: Date,
): "free" | "late" {
  return cancellationDecision(startsAt, now, noticeHours, by, bookedAt).outcome;
}

/**
 * When free cancellation ends for a lesson booked at `bookedAt`: the later of
 * the notice deadline and the end of the cooling-off, never after the start.
 * Equal to `startsAt` means the lesson can be cancelled free until it begins.
 */
export function freeCancellationEnds(startsAt: Date, noticeHours: number, bookedAt: Date): Date {
  const notice = startsAt.getTime() - noticeHours * 3600_000;
  const coolingOff = Math.min(bookedAt.getTime() + COOLING_OFF_DAYS * DAY, startsAt.getTime());
  return new Date(Math.max(notice, coolingOff));
}
