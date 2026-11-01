import type { Metadata } from "next";
import Link from "next/link";
import { SessionControls, SeriesControls } from "@/components/admin/groups/GroupControls";
import { GroupForms } from "@/components/admin/groups/GroupForms";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { requireAdmin } from "@/lib/admin-guard";
import { loadGroups } from "@/lib/admin/group-queries";
import { formatLondon, formatPence } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { londonDateOf } from "@/lib/time";

export const metadata: Metadata = { title: "Groups" };
export const dynamic = "force-dynamic";

const DAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
const pounds = (pence: number) => (pence % 100 === 0 ? String(pence / 100) : (pence / 100).toFixed(2));
const seatsText = (n: number) => (n <= 0 ? "Full" : n === 1 ? "1 seat left" : `${n} seats left`);

export default async function AdminGroupsPage({ searchParams }: { searchParams: Promise<{ weeks?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const weeks = sp.weeks === "12" ? 12 : 4;
  const now = new Date();
  const [{ series, sessions }, settings] = await Promise.all([loadGroups(now, weeks), getSettings()]);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-h1">Groups</h1>

      <section aria-labelledby="sessions-h" className="flex flex-col gap-4">
        <h2 id="sessions-h" className="text-h2">
          Upcoming sessions
        </h2>
        {sessions.length ? (
          <ul className="flex flex-col gap-3">
            {sessions.map((s) => {
              const label = `${s.title} on ${formatLondon(s.startsAt, "EEE d MMM 'at' h:mmaaa")}`;
              return (
                <Card as="li" key={s.id} className="flex flex-col gap-2 p-4 sm:p-5">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-display text-h3">{formatLondon(s.startsAt, "EEE d MMM, h:mmaaa")}</span>
                    <span className="font-display font-semibold">{s.title}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {s.status === "cancelled" ? (
                      <Badge tone="neutral">Cancelled</Badge>
                    ) : (
                      <Badge tone={s.seatsLeft === 0 ? "warning" : "success"}>{seatsText(s.seatsLeft)}</Badge>
                    )}
                    <span className="text-navy-600">
                      {s.booked} of {s.capacity} booked · {formatPence(s.pricePence)} · {s.isOnline ? "Online" : (s.venue ?? settings.groupVenue ?? "Venue not set")}
                    </span>
                  </div>
                  {s.status === "scheduled" ? (
                    <SessionControls
                      id={s.id}
                      label={label}
                      booked={s.booked}
                      initial={{ title: s.title, capacity: s.capacity, price: pounds(s.pricePence), venue: s.venue ?? "", isOnline: s.isOnline }}
                    />
                  ) : null}
                </Card>
              );
            })}
          </ul>
        ) : (
          <p>No sessions in the next {weeks} weeks.</p>
        )}
        <Link
          href={weeks === 4 ? "/admin/groups?weeks=12" : "/admin/groups"}
          className={buttonClasses({ variant: "secondary", className: "self-start" })}
        >
          {weeks === 4 ? "Show 12 weeks" : "Show 4 weeks"}
        </Link>
      </section>

      <section aria-labelledby="series-h" className="flex flex-col gap-4">
        <h2 id="series-h" className="text-h2">
          Weekly groups
        </h2>
        <ul className="flex flex-col gap-3">
          {series.map((g) => (
            <Card as="li" key={g.id} className="flex flex-col gap-2 p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-h3">{g.title}</span>
                {g.active ? <Badge tone="success">Running</Badge> : <Badge tone="neutral">Ended</Badge>}
              </div>
              <p className="text-navy-600">
                {DAYS[g.weekday]} at {g.startTime} · {g.capacity} seats · {formatPence(g.pricePence)} · {g.yearGroup} · {g.isOnline ? "Online" : (g.venue ?? settings.groupVenue ?? "Venue not set")}
              </p>
              <SeriesControls
                id={g.id}
                label={g.title}
                active={g.active}
                initial={{ title: g.title, capacity: g.capacity, price: pounds(g.pricePence), venue: g.venue ?? "", isOnline: g.isOnline }}
              />
            </Card>
          ))}
        </ul>
      </section>

      <section aria-labelledby="new-h" className="flex flex-col gap-4">
        <h2 id="new-h" className="text-h2">
          Add a group
        </h2>
        <GroupForms today={londonDateOf(now)} defaultCapacity={settings.defaultGroupCapacity} defaultPrice={pounds(settings.priceGroupPence)} />
      </section>
    </div>
  );
}
