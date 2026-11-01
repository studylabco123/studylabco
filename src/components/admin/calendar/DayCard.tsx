import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { formatLondon } from "@/lib/format";
import { TYPE_LABEL, type CalendarDay, type ItemType } from "@/lib/calendar/view";
import { DayToggle, RemoveBlock } from "./DayActions";

export const TYPE_TONE: Record<ItemType, BadgeTone> = {
  assessment: "warning",
  one_to_one: "sky",
  group: "success",
  blocked: "danger",
};
/** A coloured edge plus the word on the badge: colour is never the only signal. */
export const TYPE_EDGE: Record<ItemType, string> = {
  assessment: "border-l-warning-700",
  one_to_one: "border-l-navy-800",
  group: "border-l-success-700",
  blocked: "border-l-danger-700",
};

const dateOf = (date: string) => new Date(`${date}T12:00:00Z`);

export function DayCard({ day, today }: { day: CalendarDay; today: string }) {
  const heading = formatLondon(dateOf(day.date), "EEEE d MMMM");
  return (
    <Card as="article" aria-label={heading} className="flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-h3">{heading}</h3>
        {day.date === today ? <Badge tone="neutral">Today</Badge> : null}
        {day.inset ? <Badge tone="warning">{day.inset}</Badge> : null}
        {day.closed ? <Badge tone="danger">Closed</Badge> : null}
      </div>
      {day.items.length ? (
        <ul className="flex flex-col gap-2">
          {day.items.map((item) => (
            <li key={item.key} className={`flex flex-col gap-1 rounded-field border-l-4 bg-sky-50 px-3 py-2 ${TYPE_EDGE[item.type]}`}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Badge tone={TYPE_TONE[item.type]}>{TYPE_LABEL[item.type]}</Badge>
                {item.time ? <span className="font-display font-semibold">{item.time}</span> : null}
                <span>{item.label}</span>
              </div>
              {item.detail ? <p className="text-small text-navy-600">{item.detail}</p> : null}
              {item.blockId ? <RemoveBlock id={item.blockId} label={`${item.label} on ${heading}`} /> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-navy-600">Nothing on this day.</p>
      )}
      {day.date >= today ? <DayToggle date={day.date} closed={day.closed} label={heading} /> : null}
    </Card>
  );
}
