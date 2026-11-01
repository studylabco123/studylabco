import "server-only";
import { bankDetails, buildLines, loadBookings, loadPeople, safely } from "@/lib/email/notifications";
import { sendEmail } from "@/lib/email/send";
import { createServiceClient } from "@/lib/supabase/service";

/** Emails for the admin actions. A failure is logged and never breaks the action. */

export async function notifyHomeVisitDecision(bookingId: string, approved: boolean): Promise<void> {
  await safely("home visit decision", async () => {
    const c = createServiceClient();
    const [booking] = await loadBookings(c, [bookingId]);
    if (!booking?.parentId) return;
    const parent = (await loadPeople(c, [booking.parentId])).get(booking.parentId);
    if (!parent) return;
    const session = (await buildLines(c, [booking])).get(booking.id)!;
    const priv = await bankDetails();
    await sendEmail({
      to: parent.email,
      template: "home_visit_decision",
      bookingId,
      props: {
        parentName: parent.name,
        decision: approved ? "approved" : "declined",
        session,
        bank: priv.bank,
        noticeHours: priv.noticeHours,
      },
    });
  });
}

export async function notifyTutorCancelled(bookingId: string, refunded: boolean): Promise<void> {
  await safely("tutor cancellation", async () => {
    const c = createServiceClient();
    const [booking] = await loadBookings(c, [bookingId]);
    if (!booking?.parentId) return;
    const parent = (await loadPeople(c, [booking.parentId])).get(booking.parentId);
    if (!parent) return;
    const session = (await buildLines(c, [booking])).get(booking.id)!;
    await sendEmail({
      to: parent.email,
      template: "cancellation_receipt",
      bookingId,
      props: {
        parentName: parent.name,
        session,
        outcome: "tutor",
        wasPaid: booking.paymentStatus === "credited" || booking.paymentStatus === "refunded",
        refunded,
      },
    });
  });
}
