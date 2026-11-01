import { freeCancellationEnds } from "@/lib/booking/cancellation";
import type { Booking } from "@/lib/types";

const HOUR = 3600_000;

export type DueReminder =
  | { bookingId: string; template: "lesson_reminder" }
  | { bookingId: string; template: "free_cancel_reminder"; freeCancelUntil: Date };

/**
 * Reminders owed for confirmed bookings:
 * - free_cancel_reminder when the lesson starts in (notice, notice + 48] hours
 *   (48 to 96 h with the usual 48 h notice); it carries the deadline, which
 *   is later if the 14-day cooling-off runs past the notice deadline (R20).
 *   None is sent when the cooling-off lasts until the lesson starts: there is
 *   no deadline to remind about. (A block week's rows are made with the block.)
 * - lesson_reminder when the lesson starts in (0, 36] hours.
 * Sending is idempotent (email_log), so the daily cron may see a booking twice.
 */
export function dueReminders(bookings: Booking[], now: Date, noticeHours = 48): DueReminder[] {
  const out: DueReminder[] = [];
  for (const b of bookings) {
    if (b.status !== "confirmed") continue;
    const ahead = (b.startsAt.getTime() - now.getTime()) / HOUR;
    if (ahead > 0 && ahead <= 36) out.push({ bookingId: b.id, template: "lesson_reminder" });
    else if (ahead > noticeHours && ahead <= noticeHours + 48) {
      const until = freeCancellationEnds(b.startsAt, noticeHours, b.createdAt);
      if (until.getTime() < b.startsAt.getTime()) {
        out.push({ bookingId: b.id, template: "free_cancel_reminder", freeCancelUntil: until });
      }
    }
  }
  return out;
}

export interface BlockHoldRow {
  id: string;
  status: string;
  createdAt: Date;
  holdExpiresAt: Date | null;
}

/** Held (unpaid) blocks whose hold has run out: the tutor decides what to do. */
export function expiredBlockHolds<T extends BlockHoldRow>(blocks: T[], now: Date): T[] {
  return blocks.filter((b) => b.status === "held" && b.holdExpiresAt !== null && b.holdExpiresAt.getTime() < now.getTime());
}

/** Held blocks that are at least 48 h old, unpaid and still inside their hold. */
export function blocksNeedingPaymentReminder<T extends BlockHoldRow>(blocks: T[], now: Date): T[] {
  return blocks.filter(
    (b) =>
      b.status === "held" &&
      now.getTime() - b.createdAt.getTime() >= 48 * HOUR &&
      (b.holdExpiresAt === null || b.holdExpiresAt.getTime() >= now.getTime()),
  );
}
