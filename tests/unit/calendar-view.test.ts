import { describe, expect, test } from "vitest";
import { buildDays, dateRange, INSET_DAYS, weekStart, type ViewData } from "@/lib/calendar/view";
import { londonDateTime } from "@/lib/time";

const empty: ViewData = { bookings: [], sessions: [], blocks: [], rules: [] };
const blk = (id: string, from: string, to: string, reason = "", isDefault = false) => ({
  id,
  startsAt: new Date(from),
  endsAt: new Date(to),
  reason,
  isDefault,
});

describe("calendar view", () => {
  test("weekStart is the Monday", () => {
    expect(weekStart("2026-11-01")).toBe("2026-10-26"); // a Sunday
    expect(weekStart("2026-11-02")).toBe("2026-11-02");
    expect(weekStart("2026-11-04")).toBe("2026-11-02");
  });

  test("inset days are tagged", () => {
    expect(INSET_DAYS).toEqual({ "2026-09-01": "Inset day", "2027-01-04": "Inset day" });
    const [a, b] = buildDays(["2026-09-01", "2026-09-02"], empty);
    expect(a.inset).toBe("Inset day");
    expect(b.inset).toBeNull();
  });

  test("a whole-day London block closes the day, across the BST change", () => {
    // Sunday 2027-03-28 is the 23-hour day: midnight GMT to midnight BST.
    const days = buildDays(dateRange("2027-03-27", 3), {
      ...empty,
      blocks: [blk("1", "2027-03-28T00:00:00Z", "2027-03-28T23:00:00Z", "Closed")],
    });
    expect(days.map((d) => d.closed)).toEqual([false, true, false]);
    expect(days[1].items[0]).toMatchObject({ type: "blocked", label: "Closed", blockId: "1", time: null });
  });

  test("a partial block does not close the day and is labelled with its times", () => {
    const [d] = buildDays(["2027-07-05"], { ...empty, blocks: [blk("2", "2027-07-05T13:00:00Z", "2027-07-05T15:30:00Z", "Dentist")] });
    expect(d.closed).toBe(false);
    expect(d.items[0]).toMatchObject({ label: "Blocked: Dentist", detail: "14:00 to 16:30", time: "14:00" });
  });

  test("a multi-day block appears on each day it touches", () => {
    const days = buildDays(dateRange("2027-04-04", 5), { ...empty, blocks: [blk("3", "2027-04-05T00:00:00Z", "2027-04-08T00:00:00Z", "Holiday")] });
    // Ends 01:00 BST on the 8th, so that morning hour is still blocked.
    expect(days.map((d) => d.items.length)).toEqual([0, 1, 1, 1, 1]);
  });

  test("weekly rules show on matching weekdays within their validity", () => {
    const rule = { id: "r", weekday: 3 as const, startTime: "17:00:00", endTime: "18:00:00", validFrom: "2027-01-06", validTo: "2027-01-20", reason: "Choir" };
    const days = buildDays(dateRange("2027-01-04", 21), { ...empty, rules: [rule] });
    expect(days.filter((d) => d.items.length).map((d) => d.date)).toEqual(["2027-01-06", "2027-01-13", "2027-01-20"]);
  });

  test("types are labelled in words and ordered by time, whole-day first", () => {
    const [d] = buildDays(["2027-07-03"], {
      bookings: [
        { id: "a", kind: "assessment", startsAt: londonDateTime("2027-07-03", "17:00"), childName: "Aisha", locationLabel: "Tutor's place", status: "confirmed" },
        { id: "b", kind: "one_to_one", startsAt: londonDateTime("2027-07-03", "09:00"), childName: "Sam", locationLabel: "Online", status: "pending" },
      ],
      sessions: [{ id: "g", title: "Saturday Group", startsAt: londonDateTime("2027-07-03", "08:15"), booked: 3, capacity: 15 }],
      blocks: [blk("x", "2027-07-02T23:00:00Z", "2027-07-03T23:00:00Z")],
      rules: [],
    });
    expect(d.items.map((i) => i.label)).toEqual(["Closed", "Group: Saturday Group", "1-to-1: Sam", "Assessment: Aisha"]);
    expect(d.items[1].detail).toBe("3 of 15 booked");
    expect(d.items[2].detail).toBe("Online · Pending");
    expect(d.items[3].time).toBe("17:00");
  });
});
