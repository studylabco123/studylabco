import Link from "next/link";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import type { AccountOverview, BookingView } from "@/lib/booking/account-data";
import { FALLBACK_EMAIL } from "@/lib/site";
import { callToCancelText } from "@/lib/booking/cancellation";
import { paymentBadge } from "@/lib/booking/payment-view";
import { formatLondon, formatPence } from "@/lib/format";
import type { Booking, BookingStatus } from "@/lib/types";
import { CancelBooking } from "./CancelBooking";

function statusLabel(b: Booking): { text: string; tone: BadgeTone } {
  const labels: Record<BookingStatus, { text: string; tone: BadgeTone }> = {
    pending: { text: b.location === "home_visit" ? "Pending tutor approval" : "Pending", tone: "warning" },
    confirmed: { text: "Confirmed", tone: "success" },
    declined: { text: "Declined", tone: "danger" },
    cancelled: { text: "Cancelled", tone: "neutral" },
    late_cancelled: { text: "Late cancellation", tone: "danger" },
    no_show: { text: "Missed", tone: "danger" },
    attended: { text: "Attended", tone: "success" },
  };
  return labels[b.status];
}

/** Inside the notice period: no cancel button, ask the parent to call or email. */
function CallToCancel({ view, contact }: { view: BookingView; contact: Contact }) {
  const { noticeHours, lateFeePercent, businessPhone, email } = contact;
  return (
    <div className="flex flex-col gap-1 text-small" data-testid="call-to-cancel">
      <p>
        {callToCancelText(noticeHours, lateFeePercent, view.callFree)}
      </p>
      <p>
        {businessPhone ? (
          <>
            Call{" "}
            <a href={`tel:${businessPhone.replace(/[^+\d]/g, "")}`} className="underline underline-offset-4">
              {businessPhone}
            </a>{" "}
            or email{" "}
          </>
        ) : (
          "Email "
        )}
        <a href={`mailto:${email}`} className="underline underline-offset-4">
          {email}
        </a>
        .
      </p>
    </div>
  );
}

export function contactFrom(o: AccountOverview): Contact {
  return { noticeHours: o.noticeHours, lateFeePercent: o.lateFeePercent, businessPhone: o.businessPhone, email: FALLBACK_EMAIL };
}

export interface Contact {
  noticeHours: number;
  lateFeePercent: number;
  businessPhone: string | null;
  email: string;
}

export function BookingList({ items, empty, contact }: { items: BookingView[]; empty: string; contact: Contact }) {
  if (!items.length) return <p>{empty}</p>;
  return (
    <ul className="flex flex-col gap-4">
      {items.map((v) => {
        const b = v.booking;
        const status = statusLabel(b);
        const payment = paymentBadge(b);
        const amount = v.duePence;
        return (
          <Card as="li" key={b.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-h3">{v.title}</h3>
              <Badge tone={status.tone}>{status.text}</Badge>
              {payment ? <Badge tone={payment.tone}>{payment.text}</Badge> : null}
              {v.membership ? <Badge tone="sky">{v.membership}</Badge> : null}
            </div>
            <p>
              {formatLondon(b.startsAt, "EEEE d MMMM yyyy, HH:mm")} (UK time)
              {v.childName ? ` for ${v.childName}` : ""}
            </p>
            <p className="text-small text-navy-600">
              {amount > 0 ? `${formatPence(amount)} · ` : ""}Reference {v.reference}
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link href={`/account/bookings/${b.id}`} className="underline underline-offset-4">
                View details
              </Link>
              {v.cancellable ? <CancelBooking bookingId={b.id} /> : null}
            </div>
            {v.callRequired ? <CallToCancel view={v} contact={contact} /> : null}
          </Card>
        );
      })}
    </ul>
  );
}
