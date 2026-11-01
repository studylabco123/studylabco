import type { Metadata } from "next";
import Link from "next/link";
import { BlockForms } from "@/components/admin/calendar/BlockForms";
import { DayCard, TYPE_EDGE, TYPE_TONE } from "@/components/admin/calendar/DayCard";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { requireAdmin } from "@/lib/admin-guard";
import { loadCalendarDays } from "@/lib/admin/calendar-queries";
import { isRealDate } from "@/lib/admin/calendar-ops";
import { dateRange, TYPE_LABEL, weekStart, type ItemType } from "@/lib/calendar/view";
import { formatLondon } from "@/lib/format";
import { addDays, londonDateOf } from "@/lib/time";

export const metadata: Metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

const TYPES: ItemType[] = ["assessment", "one_to_one", "group", "blocked"];
const dateOf = (date: string) => new Date(`${date}T12:00:00Z`);

function monthBounds(date: string) {
  const first = `${date.slice(0, 7)}-01`;
  const next = addDays(addDays(first, 31).slice(0, 7) + "-01", 0);
  const last = addDays(next, -1);
  return { first, last, prev: `${addDays(first, -1).slice(0, 7)}-01`, next };
}

export default async function AdminCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const today = londonDateOf(new Date());
  const view = sp.view === "month" ? "month" : "week";
  const date = isRealDate(sp.date) ? sp.date : today;

  let dates: string[];
  let title: string;
  let prev: string;
  let next: string;
  if (view === "week") {
    const start = weekStart(date);
    dates = dateRange(start, 7);
    title = `${formatLondon(dateOf(start), "d MMM")} to ${formatLondon(dateOf(addDays(start, 6)), "d MMM yyyy")}`;
    prev = addDays(start, -7);
    next = addDays(start, 7);
  } else {
    const m = monthBounds(date);
    const start = weekStart(m.first);
    const end = addDays(weekStart(m.last), 6);
    dates = dateRange(start, (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1);
    title = formatLondon(dateOf(m.first), "MMMM yyyy");
    prev = m.prev;
    next = m.next;
  }
  const days = await loadCalendarDays(dates);
  const here = (v: string, d: string) => `/admin/calendar?view=${v}&date=${d}`;
  const inMonth = (d: string) => view === "week" || d.slice(0, 7) === date.slice(0, 7);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-h1">Calendar</h1>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Calendar view" className="flex gap-2">
          {(["week", "month"] as const).map((v) => (
            <Link
              key={v}
              href={here(v, date)}
              aria-current={view === v ? "page" : undefined}
              className={buttonClasses({ variant: view === v ? "primary" : "secondary" })}
            >
              {v === "week" ? "Week" : "Month"}
            </Link>
          ))}
        </nav>
        <nav aria-label="Change dates" className="flex flex-wrap items-center gap-2">
          <Link href={here(view, prev)} className={buttonClasses({ variant: "secondary" })}>
            Previous {view}
          </Link>
          <Link href={here(view, today)} className={buttonClasses({ variant: "quiet" })}>
            Today
          </Link>
          <Link href={here(view, next)} className={buttonClasses({ variant: "secondary" })}>
            Next {view}
          </Link>
        </nav>
      </div>

      <h2 className="text-h2" aria-live="polite">
        {title}
      </h2>

      <ul aria-label="Key" className="flex flex-wrap gap-2">
        {TYPES.map((t) => (
          <li key={t}>
            <Badge tone={TYPE_TONE[t]}>{TYPE_LABEL[t]}</Badge>
          </li>
        ))}
        <li>
          <Badge tone="warning">Inset day</Badge>
        </li>
      </ul>

      {view === "week" ? (
        <div className="flex flex-col gap-4">
          {days.map((d) => (
            <DayCard key={d.date} day={d} today={today} />
          ))}
        </div>
      ) : (
        <>
          <div className="hidden grid-cols-7 gap-2 sm:grid">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((n) => (
              <div key={n} aria-hidden="true" className="font-display text-small font-medium text-navy-600">
                {n}
              </div>
            ))}
            {days.map((d) => (
              <Link
                key={d.date}
                href={here("week", d.date)}
                className={`flex min-h-24 flex-col gap-1 rounded-field border-2 p-2 text-fine hover:bg-sky-100 ${inMonth(d.date) ? "border-sky-200 bg-white" : "border-transparent bg-sky-50 text-navy-600"} ${d.date === today ? "border-navy-900" : ""}`}
              >
                <span className="font-display font-semibold">
                  {Number(d.date.slice(8))}
                  <span className="sr-only"> {formatLondon(dateOf(d.date), "EEEE d MMMM")}</span>
                </span>
                {d.closed ? <span className="font-semibold text-danger-700">Closed</span> : null}
                {d.inset ? <span className="font-semibold text-warning-700">{d.inset}</span> : null}
                {TYPES.filter((t) => t !== "blocked" || !d.closed).map((t) => {
                  const n = d.items.filter((i) => i.type === t).length;
                  return n ? (
                    <span key={t} className={`border-l-4 pl-1.5 ${TYPE_EDGE[t]}`}>
                      {n} {TYPE_LABEL[t]}
                    </span>
                  ) : null;
                })}
              </Link>
            ))}
          </div>
          <div className="flex flex-col gap-4 sm:hidden">
            {days
              .filter((d) => inMonth(d.date) && (d.items.length > 0 || d.inset))
              .map((d) => (
                <DayCard key={d.date} day={d} today={today} />
              ))}
            {!days.some((d) => inMonth(d.date) && (d.items.length > 0 || d.inset)) ? <p>Nothing this month.</p> : null}
          </div>
        </>
      )}

      <section aria-labelledby="block-h" className="flex flex-col gap-4">
        <h2 id="block-h" className="text-h2">
          Block time off
        </h2>
        <p className="text-navy-600">Blocked time cannot be booked by parents. Existing bookings are not cancelled. Closing a whole day also stops group sessions being created for it.</p>
        <BlockForms today={today} />
      </section>
    </div>
  );
}
