import type { ReactElement } from "react";
import { AdminNotice } from "./templates/AdminNotice";
import { BlockPaymentReminder } from "./templates/BlockPaymentReminder";
import { BookingConfirmed } from "./templates/BookingConfirmed";
import { CancellationReceipt } from "./templates/CancellationReceipt";
import { ContactMessage } from "./templates/ContactMessage";
import { FreeCancelReminder } from "./templates/FreeCancelReminder";
import { GroupCancelled } from "./templates/GroupCancelled";
import { GroupMessage } from "./templates/GroupMessage";
import { HomeVisitDecision } from "./templates/HomeVisitDecision";
import { LessonReminder } from "./templates/LessonReminder";
import { freeCancelUntil } from "./templates/parts";
import { formatLondon } from "@/lib/format";

interface Def<P> {
  component: (props: P) => ReactElement;
  subject: (props: P) => string;
}
const def = <P>(component: (props: P) => ReactElement, subject: (props: P) => string): Def<P> => ({ component, subject });

const admin = def(AdminNotice, (p) => p.title);

/**
 * Every email we send. The key is also the `template` stored in email_log, so
 * it doubles as the idempotency key together with the booking or block id:
 * the several admin notices have their own keys so one booking can have them all.
 */
export const TEMPLATES = {
  booking_confirmed: def(BookingConfirmed, (p) =>
    p.sessions.some((s) => s.status === "pending" && s.location === "home_visit")
      ? "We have your home visit request"
      : `Your booking is confirmed (${p.blockReference ?? p.sessions[0]?.reference ?? "Study Lab Co"})`,
  ),
  home_visit_decision: def(HomeVisitDecision, (p) =>
    p.decision === "approved" ? "Your home visit is confirmed" : "About your home visit request",
  ),
  free_cancel_reminder: def(FreeCancelReminder, (p) =>
    `Free cancellation ends ${formatLondon(freeCancelUntil(p.session.startsAt, p.noticeHours ?? 48, p.session.bookedAt), "EEE d MMM 'at' h:mmaaa")}`,
  ),
  lesson_reminder: def(LessonReminder, (p) => `Reminder: your lesson on ${formatLondon(p.session.startsAt, "EEEE d MMMM")}`),
  cancellation_receipt: def(CancellationReceipt, () => "Your booking is cancelled"),
  group_cancelled: def(GroupCancelled, () => "Your group session has been cancelled"),
  group_message: def(GroupMessage, (p) => p.subject),
  block_payment_reminder: def(BlockPaymentReminder, (p) => `Reminder: payment for your block booking (${p.reference})`),
  contact_message: def(ContactMessage, (p) => `Contact form: ${p.name}`),
  admin_new_booking: admin,
  admin_home_visit_request: admin,
  admin_late_cancellation: admin,
  admin_new_signup: admin,
  admin_block_hold_expired: admin,
} as const;

export type TemplateName = keyof typeof TEMPLATES;
export type TemplateProps<T extends TemplateName> = Parameters<(typeof TEMPLATES)[T]["component"]>[0];
