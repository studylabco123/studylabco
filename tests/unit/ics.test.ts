import { describe, expect, test } from "vitest";
import { buildCalendar, icsFold, tokenMatches } from "@/lib/calendar/ics";
import { londonDateTime } from "@/lib/time";

const stamp = new Date("2026-11-01T09:00:00Z");

describe("buildCalendar", () => {
  test("feed contains booking with London-correct DTSTART", () => {
    const summer = londonDateTime("2027-07-03", "17:00"); // BST: 16:00Z
    const winter = londonDateTime("2026-12-05", "17:00"); // GMT: 17:00Z
    const ics = buildCalendar(
      [
        {
          uid: "a@studylabco",
          start: summer,
          end: new Date(summer.getTime() + 3600_000),
          title: "Assessment — Aisha (Y11, AQA Chem) — Tutor's place",
          location: "Tutor's place",
        },
        { uid: "b@studylabco", start: winter, end: new Date(winter.getTime() + 3600_000), title: "1-to-1 — Sam" },
      ],
      stamp,
    );
    expect(ics).toContain("DTSTART:20270703T160000Z");
    expect(ics).toContain("DTEND:20270703T170000Z");
    expect(ics).toContain("DTSTART:20261205T170000Z");
    expect(ics).toContain("SUMMARY:Assessment — Aisha (Y11\\, AQA Chem) — Tutor's place");
    expect(ics).toContain("DTSTAMP:20261101T090000Z");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });

  test("an empty feed is still a valid calendar", () => {
    const ics = buildCalendar([], stamp);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).not.toContain("VEVENT");
  });

  test("escapes text and folds long lines at 75 octets", () => {
    const start = new Date("2026-11-07T08:15:00Z");
    const ics = buildCalendar(
      [{ uid: "c", start, end: new Date(start.getTime() + 3600_000), title: `Group: ${"x".repeat(120)}; a\nb` }],
      stamp,
    );
    for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    // A semicolon in text must be written as backslash + semicolon (one backslash in the file).
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("x" + String.fromCharCode(92) + "; a" + String.fromCharCode(92) + "nb");
    expect(unfolded).not.toMatch(/SUMMARY:[^\r]*[^\\];/);
  });

  test("folding never splits a multi-byte character", () => {
    const folded = icsFold(`SUMMARY:${"—".repeat(60)}`);
    expect(folded.replace(/\r\n /g, "")).toBe(`SUMMARY:${"—".repeat(60)}`);
  });
});

describe("tokenMatches", () => {
  test("equal tokens match, anything else does not", () => {
    expect(tokenMatches("abc123", "abc123")).toBe(true);
    expect(tokenMatches("abc124", "abc123")).toBe(false);
    expect(tokenMatches("abc12", "abc123")).toBe(false);
    expect(tokenMatches("", "")).toBe(false);
  });
});
