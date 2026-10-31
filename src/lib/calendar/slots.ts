import { periodFor } from "@/lib/calendar/periods";
import { addDays, londonDateTime, londonWeekday, parseTimeMinutes } from "@/lib/time";
import type {
  AvailabilityRule,
  BlockedRule,
  BlockedTime,
  LocationKind,
  Settings,
  TermPeriod,
} from "@/lib/types";

export interface Interval {
  start: Date;
  end: Date;
}

export interface SlotInput {
  now: Date;
  fromDate: string;
  toDate: string;
  kind: "assessment" | "one_to_one";
  location: LocationKind;
  settings: Settings;
  rules: AvailabilityRule[];
  terms: TermPeriod[];
  blocks: BlockedTime[];
  blockRules: BlockedRule[];
  busy: Interval[];
}

export interface Slot {
  startsAt: Date;
  endsAt: Date;
}

const SLOT_MINUTES = 60;
const MIN_MS = 60_000;

function locationEnabled(location: LocationKind, s: Settings): boolean {
  switch (location) {
    case "online":
      return s.onlineEnabled;
    case "home_visit":
      return s.homeVisitsEnabled;
    case "tutor_place":
      return s.tutorPlaceEnabled;
    default:
      return false;
  }
}

/** Half-open interval overlap. */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function generateSlots(input: SlotInput): Slot[] {
  const { now, kind, location, settings } = input;
  if (!locationEnabled(location, settings)) return [];

  const earliest = now.getTime() + settings.minNoticeHours * 60 * MIN_MS;
  const latest = now.getTime() + settings.bookingWindowDays * 24 * 60 * MIN_MS;
  const bufferMs = location === "home_visit" ? settings.homeVisitBufferMinutes * MIN_MS : 0;
  const busy = input.busy.map((b) => [b.start.getTime(), b.end.getTime()] as const);
  const blocks = input.blocks.map((b) => [b.startsAt.getTime(), b.endsAt.getTime()] as const);

  const slots: Slot[] = [];
  for (let date = input.fromDate; date <= input.toDate; date = addDays(date, 1)) {
    const weekday = londonWeekday(date);
    const period = periodFor(date, input.terms);
    const rules = input.rules.filter(
      (r) =>
        r.period === period &&
        r.weekday === weekday &&
        r.kinds.includes(kind) &&
        r.locations.includes(location),
    );
    const dayRules = input.blockRules
      .filter((r) => r.weekday === weekday && r.validFrom <= date && (r.validTo === null || date <= r.validTo))
      .map((r) => [
        londonDateTime(date, r.startTime).getTime(),
        londonDateTime(date, r.endTime).getTime(),
      ] as const);

    for (const rule of rules) {
      const first = parseTimeMinutes(rule.startTime);
      const last = parseTimeMinutes(rule.endTime) - SLOT_MINUTES;
      for (let m = first; m <= last; m += SLOT_MINUTES) {
        const start = londonDateTime(date, `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`);
        const s = start.getTime();
        const e = s + SLOT_MINUTES * MIN_MS;
        if (s < earliest || s > latest) continue;
        const needEnd = e + bufferMs;
        if ([...busy, ...blocks, ...dayRules].some(([bs, be]) => overlaps(s, needEnd, bs, be))) continue;
        slots.push({ startsAt: start, endsAt: new Date(e) });
      }
    }
  }
  return slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}
