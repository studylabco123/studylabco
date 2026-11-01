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
  | "session_unavailable"
  | "pass_not_found"
  | "pass_not_usable"
  | "pass_too_soon"
  | "pass_expires_first"
  | "pass_used_up";

/** `message` (when set) is shown instead of the reason's generic text, for failures that carry a date. */
export type BookingResult = { ok: true; bookingId: string } | { ok: false; reason: BookingFailure; message?: string };

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
  pass_not_found: "We could not find that group pass.",
  pass_not_usable:
    "This group pass can't be used right now. Sessions unlock once we've received your payment, and a pass can't be used after it expires.",
  pass_too_soon: "That session is too soon to book with a group pass. Please choose a later one.",
  pass_expires_first: "That session is after your pass expires.",
  pass_used_up: "There are not enough sessions left on this group pass.",
};

/** Parent-facing message. */
export function failureMessage(reason: BookingFailure): string {
  return BookingFailureMessage[reason];
}
