import { ButtonLink } from "@/components/ui/Button";
import { formatLondon, formatPence } from "@/lib/format";
import type { PublicGroup } from "@/lib/public/data";

/** Upcoming group sessions with honest seat counts. Times are UK time. */
export function GroupList({ groups, bookHref, label = "Upcoming group sessions" }: { groups: PublicGroup[]; bookHref: string; label?: string }) {
  if (!groups.length) {
    return (
      <p className="rounded-card border border-dashed border-navy-400 bg-white p-6 text-navy-600">
        No group sessions are open for booking right now. New dates are added every week, so please check back soon.
      </p>
    );
  }
  return (
    <ul aria-label={label} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {groups.map((g) => {
        const full = g.seatsLeft <= 0;
        const when = formatLondon(g.startsAt, "EEEE d MMMM");
        return (
          <li key={g.id} className="flex flex-col rounded-card border border-sky-200 bg-white">
            <div className="flex items-stretch border-b border-sky-200">
              <p className="flex flex-col justify-center rounded-tl-card border-r border-sky-200 bg-sky-100 px-4 py-3 text-center font-display leading-tight">
                <span className="text-fine text-navy-600">{formatLondon(g.startsAt, "EEE")}</span>
                <span className="text-h2 font-semibold tabular-nums">{formatLondon(g.startsAt, "d")}</span>
                <span className="text-fine text-navy-600">{formatLondon(g.startsAt, "MMM")}</span>
              </p>
              <div className="flex flex-1 flex-col justify-center gap-0.5 px-4 py-3">
                <h3 className="font-display text-small font-semibold">{g.title}</h3>
                <p className="text-small text-navy-600">
                  <span className="sr-only">{when}, </span>
                  <time dateTime={g.startsAt.toISOString()}>
                    {formatLondon(g.startsAt, "h:mmaaa")} to {formatLondon(g.endsAt, "h:mmaaa")}
                  </time>
                </p>
              </div>
            </div>
            <dl className="grid flex-1 grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-4 py-4 text-small">
              {g.yearGroup ? (
                <>
                  <dt className="text-navy-600">For</dt>
                  <dd>{g.yearGroup}</dd>
                </>
              ) : null}
              <dt className="text-navy-600">Where</dt>
              <dd>{g.venue}</dd>
              <dt className="text-navy-600">Price</dt>
              <dd className="tabular-nums">{formatPence(g.pricePence)} per student</dd>
              <dt className="text-navy-600">Seats</dt>
              <dd className={full ? "font-semibold" : "font-semibold text-success-700"}>
                {full ? "Full" : `${g.seatsLeft} ${g.seatsLeft === 1 ? "seat" : "seats"} left`}
              </dd>
            </dl>
            <div className="px-4 pb-4">
              {full ? (
                <p className="text-small text-navy-600">This session is full.</p>
              ) : (
                <ButtonLink href={bookHref} variant="secondary" className="w-full">
                  Book a seat<span className="sr-only">, {g.title}, {when}</span>
                </ButtonLink>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
