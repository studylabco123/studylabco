import type { Metadata } from "next";
import Link from "next/link";
import { BlockActions } from "@/components/admin/BlockActions";
import { BookingActions } from "@/components/admin/BookingActions";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { requireAdmin } from "@/lib/admin-guard";
import { KIND_LABEL, LOCATION_LABEL, PAYMENT_LABEL, statusLabel } from "@/lib/admin/labels";
import { BOOKING_FILTERS, loadBookings, type BookingFilter } from "@/lib/admin/queries";
import { formatLondon, formatPence } from "@/lib/format";

export const metadata: Metadata = { title: "Bookings" };
export const dynamic = "force-dynamic";

const FILTER_LABEL: Record<BookingFilter, string> = {
  upcoming: "Upcoming",
  todo: "To do",
  unpaid: "Unpaid",
  past: "Past",
  all: "All",
};

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const filter = (BOOKING_FILTERS as readonly string[]).includes(sp.filter ?? "") ? (sp.filter as BookingFilter) : "upcoming";
  const q = (sp.q ?? "").slice(0, 80);
  const now = new Date();
  const { items, blocks } = await loadBookings(filter, q, now);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-h1">Bookings</h1>

      <form action="/admin/bookings" method="get" role="search" aria-label="Search bookings" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="filter" value={filter} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor="q" className="font-display text-small font-medium">
            Search by parent, child or reference
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q}
            className="block w-full rounded-field border-2 border-navy-400 bg-white px-3.5 py-2.5 text-body text-navy-900"
          />
        </div>
        <button type="submit" className="min-h-11 rounded-full bg-navy-900 px-5 font-display text-small font-medium text-white">
          Search
        </button>
      </form>

      <nav aria-label="Booking filters">
        <ul className="flex flex-wrap gap-2">
          {BOOKING_FILTERS.map((f) => (
            <li key={f}>
              <Link
                href={`/admin/bookings?filter=${f}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                aria-current={f === filter ? "page" : undefined}
                className={
                  "inline-flex min-h-11 items-center rounded-full border-2 border-navy-900 px-4 font-display text-small font-medium " +
                  (f === filter ? "bg-navy-900 text-white" : "bg-white text-navy-900 hover:bg-sky-100")
                }
              >
                {FILTER_LABEL[f]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {blocks.length ? (
        <section id="blocks" aria-labelledby="blocks-h" className="flex flex-col gap-4">
          <h2 id="blocks-h" className="text-h2">
            Block bookings awaiting payment
          </h2>
          <ul className="flex flex-col gap-3">
            {blocks.map((b) => (
              <Card as="li" key={b.id} tone="sky" className="flex flex-col gap-3 p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-h3">
                    {b.childName} ({b.parentName})
                  </h3>
                  <Badge tone={b.expired ? "danger" : "warning"}>{b.expired ? "Hold expired" : "On hold"}</Badge>
                </div>
                <p className="text-navy-600">
                  {b.product === "sunday_bundle" ? "Sunday bundle" : "Saturday"} block, {b.weeks} weeks · {formatPence(b.pricePence)} · Reference{" "}
                  {b.reference}
                  {b.holdExpiresAt ? ` · hold ${b.expired ? "ended" : "ends"} ${formatLondon(b.holdExpiresAt, "EEE d MMM, h:mmaaa")}` : ""}
                </p>
                <BlockActions blockId={b.id} label={`${b.childName} ${b.reference}`} />
              </Card>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="list-h" className="flex flex-col gap-4">
        <h2 id="list-h" className="text-h2">
          {FILTER_LABEL[filter]} bookings
        </h2>
        {items.length ? (
          <ul className="flex flex-col gap-4">
            {items.map((i) => {
              const b = i.booking;
              const status = statusLabel(b.status, b.location);
              const pay = PAYMENT_LABEL[b.paymentStatus];
              return (
                <Card as="li" key={b.id} data-booking-id={b.id} className="flex flex-col gap-3 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-h3">{i.childName}</h3>
                    {i.parentId ? (
                      <Link href={`/admin/families/${i.parentId}`} className="inline-flex min-h-11 items-center underline underline-offset-4">
                        {i.parentName}
                      </Link>
                    ) : (
                      <span>{i.parentName}</span>
                    )}
                  </div>
                  <p>
                    {formatLondon(b.startsAt, "EEE d MMM yyyy, h:mmaaa")} · {KIND_LABEL[b.kind]} · {LOCATION_LABEL[b.location]}
                  </p>
                  {b.homeAddress ? <p className="text-navy-600">{b.homeAddress}</p> : null}
                  <p className="text-small text-navy-600">
                    {formatPence(b.pricePence + b.travelFeePence)} · Reference {b.paymentReference}
                    {i.owedPence > 0 ? ` · owes ${formatPence(i.owedPence)}` : ""}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={status.tone}>{status.text}</Badge>
                    <Badge tone={pay.tone}>{pay.text}</Badge>
                    {i.membership ? <Badge tone="sky">{i.membership}</Badge> : null}
                  </div>
                  <BookingActions
                    bookingId={b.id}
                    childName={i.childName}
                    status={b.status}
                    location={b.location}
                    paymentStatus={b.paymentStatus}
                    started={b.startsAt.getTime() <= now.getTime()}
                    owedPence={i.owedPence}
                    bundle={Boolean(b.bundleId) && !b.blockBookingId}
                    inBlock={Boolean(b.blockBookingId) && !i.blockReleased}
                  />
                </Card>
              );
            })}
          </ul>
        ) : (
          <p>No bookings to show.</p>
        )}
      </section>
    </div>
  );
}
