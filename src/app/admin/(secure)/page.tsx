import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { requireAdmin } from "@/lib/admin-guard";
import { KIND_LABEL, LOCATION_LABEL, PAYMENT_LABEL, statusLabel } from "@/lib/admin/labels";
import { loadToday, type AlertLink } from "@/lib/admin/queries";
import { formatLondon, formatPence } from "@/lib/format";

export const metadata: Metadata = { title: "Today" };
export const dynamic = "force-dynamic";

/** Alert lines carry a small machine-readable detail; turn it into words. */
function alertText(key: string, a: AlertLink): string {
  if (key === "home-visits") return formatLondon(new Date(a.detail), "EEE d MMM, h:mmaaa");
  if (key === "unpaid") {
    const [pence, n] = a.detail.split("|").map(Number);
    return `owes ${formatPence(pence)} for ${n} ${n === 1 ? "lesson" : "lessons"}`;
  }
  if (key === "flagged") return `${a.detail} late cancellations or no-shows in the last 12 months`;
  return a.detail;
}

export default async function AdminTodayPage() {
  await requireAdmin();
  const { date, lessons, alerts } = await loadToday();
  const heading = formatLondon(new Date(`${date}T12:00:00Z`), "EEEE d MMMM");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Today</h1>
        <p className="text-lead text-navy-600">{heading}</p>
      </div>

      <section aria-labelledby="lessons-h" className="flex flex-col gap-4">
        <h2 id="lessons-h" className="text-h2">
          Lessons
        </h2>
        {lessons.length ? (
          <ul className="flex flex-col gap-3">
            {lessons.map(({ booking: b, childName, parentId }) => {
              const status = statusLabel(b.status, b.location);
              const pay = PAYMENT_LABEL[b.paymentStatus];
              return (
                <Card as="li" key={b.id} className="flex flex-col gap-2 p-4 sm:p-5">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-display text-h3">{formatLondon(b.startsAt, "h:mmaaa")}</span>
                    {parentId ? (
                      <Link href={`/admin/families/${parentId}`} className="font-display font-semibold underline underline-offset-4">
                        {childName}
                      </Link>
                    ) : (
                      <span className="font-display font-semibold">{childName}</span>
                    )}
                  </div>
                  <p className="text-navy-600">
                    {KIND_LABEL[b.kind]} · {LOCATION_LABEL[b.location]}
                    {b.homeAddress ? ` · ${b.homeAddress}` : ""}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={status.tone}>{status.text}</Badge>
                    <Badge tone={pay.tone}>{pay.text}</Badge>
                    <Link
                      href={`/admin/bookings?filter=all&q=${b.paymentReference}`}
                      className="inline-flex min-h-11 items-center px-2 text-small underline underline-offset-4"
                    >
                      Manage {b.paymentReference}
                    </Link>
                  </div>
                </Card>
              );
            })}
          </ul>
        ) : (
          <p>No lessons today.</p>
        )}
      </section>

      <section aria-labelledby="alerts-h" className="flex flex-col gap-4">
        <h2 id="alerts-h" className="text-h2">
          Needs your attention
        </h2>
        {alerts.length ? (
          <ul className="flex flex-col gap-4">
            {alerts.map((g) => (
              <Card as="li" key={g.key} tone="sky" className="flex flex-col gap-2 p-4 sm:p-5">
                <h3 className="font-display text-h3">
                  {g.title} ({g.items.length})
                </h3>
                <ul className="flex flex-col">
                  {g.items.map((a) => (
                    <li key={a.key} className="flex flex-wrap items-center gap-x-2">
                      <Link href={a.href} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
                        {a.label}
                      </Link>
                      <span className="text-navy-600">{alertText(g.key, a)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </ul>
        ) : (
          <p>Nothing needs your attention.</p>
        )}
      </section>
    </div>
  );
}
