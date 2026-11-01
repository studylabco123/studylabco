import { formatLondon } from "@/lib/format";
import { addDays, londonDateOf, londonDateTime, londonWeekday, parseTimeMinutes } from "@/lib/time";
import type { BlockedRule, BlockedTime } from "@/lib/types";

/** Pure model of the admin calendar: which things happen on which London day. */

/** School inset days: tagged on the calendar so the tutor remembers them. */
export const INSET_DAYS: Readonly<Record<string, string>> = {
  "2026-09-01": "Inset day",
  "2027-01-04": "Inset day",
};

export type ItemType = "assessment" | "one_to_one" | "group" | "blocked";

export interface DayItem {
  key: string;
  type: ItemType;
  /** "17:00" for timed items, null for a whole day. */
  time: string | null;
  /** Used to order a day; whole-day items come first. */
  sortMinutes: number;
  label: string;
  detail?: string;
  /** Present on blocks that can be removed with unblock(). */
  blockId?: string;
}

export interface CalendarDay {
  date: string;
  items: DayItem[];
  /** A block covers the whole London day. */
  closed: boolean;
  inset: string | null;
}

export interface ViewBooking {
  id: string;
  kind: "assessment" | "one_to_one";
  startsAt: Date;
  childName: string;
  locationLabel: string;
  status: string;
}

export interface ViewSession {
  id: string;
  title: string;
  startsAt: Date;
  booked: number;
  capacity: number;
}

export interface ViewData {
  bookings: ViewBooking[];
  sessions: ViewSession[];
  blocks: BlockedTime[];
  rules: BlockedRule[];
}

export const TYPE_LABEL: Record<ItemType, string> = {
  assessment: "Assessment",
  one_to_one: "1-to-1",
  group: "Group",
  blocked: "Blocked",
};

/** `count` consecutive London dates from `start`. */
export function dateRange(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

/** The Monday on or before a date. */
export function weekStart(date: string): string {
  const dow = londonWeekday(date);
  return addDays(date, -((dow + 6) % 7));
}

export function buildDays(dates: string[], data: ViewData): CalendarDay[] {
  const byDate = new Map<string, CalendarDay>(
    dates.map((date) => [date, { date, items: [], closed: false, inset: INSET_DAYS[date] ?? null }]),
  );
  const push = (date: string, item: DayItem) => byDate.get(date)?.items.push(item);

  for (const b of data.bookings) {
    push(londonDateOf(b.startsAt), {
      key: `b-${b.id}`,
      type: b.kind,
      time: formatLondon(b.startsAt, "HH:mm"),
      sortMinutes: parseTimeMinutes(formatLondon(b.startsAt, "HH:mm")),
      label: `${TYPE_LABEL[b.kind]}: ${b.childName}`,
      detail: `${b.locationLabel}${b.status === "pending" ? " · Pending" : ""}`,
    });
  }
  for (const s of data.sessions) {
    push(londonDateOf(s.startsAt), {
      key: `g-${s.id}`,
      type: "group",
      time: formatLondon(s.startsAt, "HH:mm"),
      sortMinutes: parseTimeMinutes(formatLondon(s.startsAt, "HH:mm")),
      label: `Group: ${s.title}`,
      detail: `${s.booked} of ${s.capacity} booked`,
    });
  }

  for (const day of byDate.values()) {
    const start = londonDateTime(day.date, "00:00");
    const end = londonDateTime(addDays(day.date, 1), "00:00");
    for (const blk of data.blocks) {
      if (blk.endsAt <= start || blk.startsAt >= end) continue;
      const whole = blk.startsAt <= start && blk.endsAt >= end;
      if (whole) day.closed = true;
      const from = formatLondon(blk.startsAt, "HH:mm");
      const to = formatLondon(blk.endsAt, "HH:mm");
      const startsToday = londonDateOf(blk.startsAt) === day.date;
      day.items.push({
        key: `x-${blk.id}-${day.date}`,
        type: "blocked",
        time: whole ? null : startsToday ? from : "00:00",
        sortMinutes: whole ? -1 : startsToday ? parseTimeMinutes(from) : 0,
        label: whole ? `Closed${blk.reason && blk.reason !== "Closed" ? `: ${blk.reason}` : ""}` : `Blocked${blk.reason ? `: ${blk.reason}` : ""}`,
        detail: whole
          ? blk.isDefault
            ? "Closed all day (default closure)"
            : "Closed all day"
          : londonDateOf(blk.endsAt) === day.date
            ? `${startsToday ? from : "00:00"} to ${to}`
            : `${startsToday ? from : "00:00"} onwards`,
        blockId: blk.id,
      });
    }
    const weekday = londonWeekday(day.date);
    for (const rule of data.rules) {
      if (rule.weekday !== weekday || day.date < rule.validFrom || (rule.validTo !== null && day.date > rule.validTo)) continue;
      const from = rule.startTime.slice(0, 5);
      day.items.push({
        key: `r-${rule.id}-${day.date}`,
        type: "blocked",
        time: from,
        sortMinutes: parseTimeMinutes(from),
        label: `Blocked every week${rule.reason ? `: ${rule.reason}` : ""}`,
        detail: `${from} to ${rule.endTime.slice(0, 5)}`,
        blockId: rule.id,
      });
    }
    day.items.sort((a, b) => a.sortMinutes - b.sortMinutes || a.key.localeCompare(b.key));
  }
  return [...byDate.values()];
}
