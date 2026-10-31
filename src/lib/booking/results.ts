import { IneligibleMessage, type IneligibleReason } from "./eligibility";

/** Every way a booking request can be refused. Safe to import from client code. */
export type BookingFailure =
  | IneligibleReason
  | "child_not_found"
  | "address_required"
  | "cooling_off_required"
  | "slot_taken"
  | "already_booked"
  | "session_full"
  | "session_cancelled"
  | "session_unavailable";

export type BookingResult =
  | { ok: true; bookingId: string }
  | { ok: false; reason: BookingFailure; fullDate?: string };

export const COOLING_OFF_TEXT =
  "I want lessons to start within 14 days and understand I lose the right to cancel once a lesson has taken place.";

export const BookingFailureMessage: Record<BookingFailure, string> = {
  ...IneligibleMessage,
  child_not_found: "We could not find that child.",
  address_required: "Please enter the address for the home visit.",
  cooling_off_required: "Please tick the box to confirm you want lessons to start within 14 days.",
  slot_taken: "Sorry, that time was just taken. Please choose another.",
  already_booked: "This child is already booked on that session.",
  session_full: "Sorry, that session is full.",
  session_cancelled: "Sorry, that session has been cancelled.",
  session_unavailable: "That session can no longer be booked. Please choose another.",
};

/** Parent-facing message; names the full week for blocks. */
export function failureMessage(reason: BookingFailure, fullDateLabel?: string): string {
  if (reason === "session_full" && fullDateLabel) {
    return `Sorry, the session on ${fullDateLabel} is full, so this block can't be booked. Please choose another start date.`;
  }
  return BookingFailureMessage[reason];
}
