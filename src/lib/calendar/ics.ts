import { timingSafeEqual } from "node:crypto";

/**
 * Private calendar feed (RFC 5545). Pure: no database, no clock except the
 * optional `stamp`. Times are written as UTC instants (DTSTART:...Z), which
 * every calendar app shows in the viewer's own zone, so they are correct on
 * both sides of the BST/GMT change without a VTIMEZONE block.
 *
 * The feed carries titles, times and a venue label only: never medical or SEN
 * information, and never a family's home address.
 */

export interface CalendarEntry {
  /** Stable per event, so a calendar app updates rather than duplicates it. */
  uid: string;
  start: Date;
  end: Date;
  title: string;
  /** A venue label such as "Tutor's place"; never a home address. */
  location?: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 2026-07-04T16:00:00Z -> 20260704T160000Z */
export function icsUtc(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** TEXT escaping: backslash, semicolon, comma and newlines. */
export function icsEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Folds a content line at 75 octets, continuing with a leading space (never splitting a character). */
export function icsFold(line: string): string {
  if (Buffer.byteLength(line) <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (bytes + n > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
      limit = 74; // the leading space counts
    }
    current += ch;
    bytes += n;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildCalendar(entries: CalendarEntry[], stamp: Date = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Study Lab Co//Tuition calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Study Lab Co",
    "X-WR-TIMEZONE:Europe/London",
  ];
  for (const e of entries) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${icsEscape(e.uid)}`,
      `DTSTAMP:${icsUtc(stamp)}`,
      `DTSTART:${icsUtc(e.start)}`,
      `DTEND:${icsUtc(e.end)}`,
      `SUMMARY:${icsEscape(e.title)}`,
    );
    if (e.location) lines.push(`LOCATION:${icsEscape(e.location)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
}

/** Constant-time token comparison; different lengths never match (and are not compared). */
export function tokenMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || b.length === 0) return false;
  return timingSafeEqual(a, b);
}
