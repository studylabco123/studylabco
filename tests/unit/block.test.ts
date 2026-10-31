import { describe, expect, test } from "vitest";
import { planBlock } from "@/lib/booking/block";
import { addDays, londonDateTime } from "@/lib/time";
import type { GroupSession } from "@/lib/types";

function session(date: string, time: string, status: GroupSession["status"] = "scheduled"): GroupSession {
  const startsAt = londonDateTime(date, time);
  return {
    id: `${date}T${time}`,
    seriesId: null,
    title: "Group",
    startsAt,
    endsAt: new Date(startsAt.getTime() + 3600_000),
    capacity: 15,
    pricePence: 1800,
    venue: null,
    isOnline: false,
    status,
  };
}

/** Weekly sessions from `first` for `n` weeks at each of `times`. */
function weekly(first: string, n: number, times: string[]): GroupSession[] {
  const out: GroupSession[] = [];
  for (let w = 0; w < n; w++) for (const t of times) out.push(session(addDays(first, 7 * w), t));
  return out;
}

const seats = (sessions: GroupSession[], n = 15) => Object.fromEntries(sessions.map((s) => [s.id, n]));

describe("planBlock", () => {
  test("planBlock 6 weeks Saturday returns 6 ids", () => {
    const sessions = weekly("2026-11-07", 12, ["08:15"]);
    const r = planBlock(sessions, seats(sessions), "saturday", 6, "2026-11-07");
    expect(r).toEqual({ ok: true, sessionIds: sessions.slice(0, 6).map((s) => s.id) });
  });

  test("planBlock skips cancelled week", () => {
    const sessions = weekly("2026-11-07", 12, ["08:15"]);
    sessions[1] = { ...sessions[1], status: "cancelled" };
    const r = planBlock(sessions, seats(sessions), "saturday", 6, "2026-11-07");
    expect(r).toEqual({ ok: true, sessionIds: [0, 2, 3, 4, 5, 6].map((i) => sessions[i].id) });
  });

  test("planBlock rejects full week", () => {
    const sessions = weekly("2026-11-07", 12, ["08:15"]);
    const left = seats(sessions);
    left[sessions[2].id] = 0;
    expect(planBlock(sessions, left, "saturday", 6, "2026-11-07")).toEqual({ ok: false, fullDate: "2026-11-21" });
  });

  test("sunday_bundle 6 weeks returns 12 ids", () => {
    const sessions = weekly("2026-11-08", 12, ["08:15", "09:15"]);
    const r = planBlock(sessions, seats(sessions), "sunday_bundle", 6, "2026-11-08");
    expect(r).toEqual({ ok: true, sessionIds: sessions.slice(0, 12).map((s) => s.id) });
  });

  test("starts from firstDate and ignores earlier sessions, in any input order", () => {
    const sessions = weekly("2026-11-07", 12, ["08:15"]);
    const r = planBlock([...sessions].reverse(), seats(sessions), "saturday", 6, "2026-11-14");
    expect(r).toEqual({ ok: true, sessionIds: sessions.slice(1, 7).map((s) => s.id) });
  });

  test("sunday_bundle week with a cancelled session is skipped; a full session rejects", () => {
    const sessions = weekly("2026-11-08", 12, ["08:15", "09:15"]);
    sessions[3] = { ...sessions[3], status: "cancelled" }; // week 2, session 2
    const r = planBlock(sessions, seats(sessions), "sunday_bundle", 6, "2026-11-08");
    expect(r.ok && r.sessionIds).toEqual([0, 1, ...[4, 5, 6, 7, 8, 9, 10, 11, 12, 13]].map((i) => sessions[i].id));

    const left = seats(sessions);
    left[sessions[5].id] = 0; // week 3, session 2
    expect(planBlock(sessions, left, "sunday_bundle", 6, "2026-11-08")).toEqual({ ok: false, fullDate: "2026-11-22" });
  });

  test("not enough scheduled weeks", () => {
    const sessions = weekly("2026-11-07", 4, ["08:15"]);
    expect(planBlock(sessions, seats(sessions), "saturday", 6, "2026-11-07")).toEqual({ ok: false, notEnoughWeeks: true });
  });
});
