import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatLondon, formatPence } from "@/lib/format";
import { getPrivateSettings, getSettings } from "@/lib/settings";
import { mapBooking, mapGroupSession, type BookingRow, type GroupSessionRow } from "@/lib/supabase/mappers";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { bookingPaymentSummary, paymentBadge } from "@/lib/booking/payment-view";
import type { Booking, BookingStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Your booking" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KIND_LABEL = { assessment: "Assessment Lesson", one_to_one: "1-to-1 lesson", group: "Group session" } as const;

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

const when = (d: Date) => formatLondon(d, "EEEE d MMMM yyyy, HH:mm");

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(`/login?next=${encodeURIComponent(`/account/bookings/${id}`)}`);

  const c = createServiceClient();
  const { data: row } = await c.from("bookings").select("*").eq("id", id).eq("parent_id", auth.user.id).maybeSingle();
  if (!row) notFound();
  const booking = mapBooking(row as BookingRow);

  // The other seats that belong with this one (Sunday bundle or block).
  let related: Booking[] = [booking];
  let block: {
    payment_reference: string;
    price_pence: number;
    weeks: number;
    hold_expires_at: string | null;
    status: "held" | "paid" | "released";
  } | null = null;
  if (booking.blockBookingId) {
    const [b, seats] = await Promise.all([
      c.from("block_bookings").select("payment_reference, price_pence, weeks, hold_expires_at, status").eq("id", booking.blockBookingId).single(),
      c.from("bookings").select("*").eq("block_booking_id", booking.blockBookingId).order("starts_at"),
    ]);
    block = b.data;
    related = ((seats.data ?? []) as BookingRow[]).map(mapBooking);
  } else if (booking.bundleId) {
    const { data } = await c.from("bookings").select("*").eq("bundle_id", booking.bundleId).order("starts_at");
    related = ((data ?? []) as BookingRow[]).map(mapBooking);
  }

  const [settings, priv, child, session] = await Promise.all([
    getSettings(),
    getPrivateSettings(),
    booking.childId ? c.from("children").select("first_name, last_name").eq("id", booking.childId).maybeSingle() : null,
    booking.groupSessionId
      ? c.from("group_sessions").select("*").eq("id", booking.groupSessionId).maybeSingle()
      : null,
  ]);
  const group = session?.data ? mapGroupSession(session.data as GroupSessionRow) : null;

  // A released block's lessons are paid one by one with their own reference (Ruling R16).
  const reference = block && block.status !== "released" ? block.payment_reference : booking.paymentReference;
  const money = bookingPaymentSummary(related, block ? { pricePence: block.price_pence, status: block.status } : null, settings.lateFeePercent);
  const status = statusLabel(booking);
  const nowMs = new Date().getTime();
  // Owed for a lesson that has happened or was cancelled late: no "before the lesson".
  const afterTheLesson = related.some((b) => b.status === "late_cancelled" || b.startsAt.getTime() <= nowMs);
  // A held block is paid as a whole, so an unpaid week's badge follows the block's amount due.
  const payment =
    block?.status === "held" && booking.paymentStatus === "unpaid"
      ? money.showHowToPay
        ? ({ text: "Unpaid", tone: "warning" } as const)
        : null
      : paymentBadge(booking);
  const confirmed = booking.status === "confirmed" || booking.status === "attended";
  const bank = priv.bankAccountName && priv.bankSortCode && priv.bankAccountNumber;

  let where: string;
  if (booking.kind === "group") where = group?.venue ?? settings.groupVenue ?? "Location confirmed on booking";
  else if (booking.location === "home_visit") where = "Home visit";
  else if (booking.location === "online") where = "Online";
  else where = "At the tutor's place";

  const title = block
    ? `Group block (${block.weeks} weeks)`
    : related.length === 2 && booking.bundleId
      ? "Sunday bundle"
      : group?.title ?? KIND_LABEL[booking.kind];

  return (
    <div className="mx-auto flex max-w-content flex-col gap-8 px-5 py-12 sm:px-8">
      <div className="flex flex-col gap-2">
        <Link href="/account" className="underline underline-offset-4">
          Back to your account
        </Link>
        <h1 className="text-h1">{booking.status === "pending" ? "Booking requested" : "Your booking"}</h1>
        <p className="text-lead">
          {title}
          {child?.data ? ` for ${child.data.first_name} ${child.data.last_name}` : ""}
        </p>
      </div>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={status.tone}>{status.text}</Badge>
          {payment ? (
            <Badge tone={payment.tone} data-testid="payment-badge">
              {payment.text}
            </Badge>
          ) : null}
        </div>
        <dl className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <dt className="font-display font-medium">Reference</dt>
          <dd data-testid="reference">{reference}</dd>
          <dt className="font-display font-medium">{related.length > 1 ? "Dates" : "When"}</dt>
          <dd>
            <ul>
              {related.map((b) => (
                <li key={b.id}>{when(b.startsAt)} (UK time)</li>
              ))}
            </ul>
          </dd>
          <dt className="font-display font-medium">Where</dt>
          <dd>
            {where}
            {booking.location === "home_visit" && booking.homeAddress ? (
              <>
                : {booking.homeAddress}, {booking.homePostcode}
              </>
            ) : null}
          </dd>
          {booking.location === "tutor_place" && confirmed && priv.teachingAddress ? (
            <>
              <dt className="font-display font-medium">Address</dt>
              <dd className="whitespace-pre-line">{priv.teachingAddress}</dd>
            </>
          ) : null}
          {booking.location === "online" && confirmed && priv.meetingLink ? (
            <>
              <dt className="font-display font-medium">Meeting link</dt>
              <dd>
                <a href={priv.meetingLink} className="underline underline-offset-4">
                  {priv.meetingLink}
                </a>
              </dd>
            </>
          ) : null}
          <dt className="font-display font-medium">Total</dt>
          <dd data-testid="booking-total">{formatPence(money.totalPence)}</dd>
        </dl>
        {money.awaitingApproval ? (
          <p>
            The tutor will confirm or decline this home visit soon. We will email you either way. Please do not pay until it
            is confirmed.
          </p>
        ) : null}
      </Card>

      {money.showHowToPay ? (
        <Card tone="sky" className="flex flex-col gap-3">
          <h2 className="text-h2">How to pay</h2>
          <p>
            Pay <span data-testid="to-pay">{formatPence(money.toPayPence)}</span>
            {afterTheLesson ? " by bank transfer" : " by bank transfer before the lesson"}
            , using your reference so we can match it.
            {block?.status === "held" && block.hold_expires_at
              ? ` Seats are held until ${when(new Date(block.hold_expires_at))} while you pay.`
              : ""}
          </p>
          {bank ? (
            <div role="group" aria-label="Bank details">
              <dl className="grid gap-2 sm:grid-cols-[10rem_1fr]">
                <dt className="font-display font-medium">Account name</dt>
                <dd>{priv.bankAccountName}</dd>
                <dt className="font-display font-medium">Sort code</dt>
                <dd>{priv.bankSortCode}</dd>
                <dt className="font-display font-medium">Account number</dt>
                <dd>{priv.bankAccountNumber}</dd>
                <dt className="font-display font-medium">Reference</dt>
                <dd>{reference}</dd>
              </dl>
            </div>
          ) : (
            <p>We will email you the bank details with your reference {reference}.</p>
          )}
          {afterTheLesson ? null : <p>You can also pay in cash before the lesson starts.</p>}
        </Card>
      ) : null}

      <div>
        <ButtonLink href="/account/book" variant="secondary">
          Book another lesson
        </ButtonLink>
      </div>
    </div>
  );
}
