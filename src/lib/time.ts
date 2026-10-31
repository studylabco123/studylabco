import { TZDate } from "@date-fns/tz";

export const LONDON = "Europe/London";

/** Minutes after midnight from "HH:mm" or "HH:mm:ss". */
export function parseTimeMinutes(time: string): number {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(time);
  if (!m) throw new Error(`Invalid time: ${time}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** The UTC instant of a London wall-clock date ('YYYY-MM-DD') and time ('HH:mm[:ss]'). */
export function londonDateTime(date: string, time: string): Date {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!d) throw new Error(`Invalid date: ${date}`);
  const mins = parseTimeMinutes(time);
  const z = new TZDate(
    Number(d[1]),
    Number(d[2]) - 1,
    Number(d[3]),
    Math.floor(mins / 60),
    mins % 60,
    0,
    LONDON,
  );
  return new Date(z.getTime());
}

/** The London calendar date ('YYYY-MM-DD') of an instant. */
export function londonDateOf(instant: Date): string {
  const z = new TZDate(instant.getTime(), LONDON);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(z.getFullYear(), 4)}-${p(z.getMonth() + 1)}-${p(z.getDate())}`;
}

/** 0 = Sunday ... 6 = Saturday for a calendar date. */
export function londonWeekday(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

/** Add whole calendar days to a 'YYYY-MM-DD' date (pure calendar arithmetic). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
