import Link from "next/link";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import type { BookingView } from "@/lib/booking/account-data";
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

export function BookingList({ items, empty }: { items: BookingView[]; empty: string }) {
  if (!items.length) return <p>{empty}</p>;
  return (
    <ul className="flex flex-col gap-4">
      {items.map((v) => {
        const b = v.booking;
        const status = statusLabel(b);
        return (
          <Card as="li" key={b.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-h3">{v.title}</h3>
              <Badge tone={status.tone}>{status.text}</Badge>
              {v.membership ? <Badge tone="sky">{v.membership}</Badge> : null}
            </div>
            <p>
              {formatLondon(b.startsAt, "EEEE d MMMM yyyy, HH:mm")} (UK time)
              {v.childName ? ` for ${v.childName}` : ""}
            </p>
            <p className="text-small text-navy-600">
              {formatPence(b.pricePence + b.travelFeePence)} · Reference {b.paymentReference}
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link href={`/account/bookings/${b.id}`} className="underline underline-offset-4">
                View details
              </Link>
              {v.cancellable ? <CancelBooking bookingId={b.id} lateFeePence={v.lateFeePence} /> : null}
            </div>
          </Card>
        );
      })}
    </ul>
  );
}
