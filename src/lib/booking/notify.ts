import "server-only";
import { notifyBookingCancelled, notifyBookingCreated, safely } from "@/lib/email/notifications";

/**
 * The booking services call this once per successful request with every
 * booking id it created. Sends the confirmation and the admin notice; a
 * failure is logged and never breaks the booking.
 */
export async function onBookingCreated(bookingIds: string[]): Promise<void> {
  await safely("booking created", () => notifyBookingCreated(bookingIds));
}

/** Called once after a parent cancels a booking (receipt, plus a notice when late). */
export async function onBookingCancelled(bookingId: string, outcome: "free" | "late"): Promise<void> {
  await safely("booking cancelled", () => notifyBookingCancelled(bookingId, outcome));
}
