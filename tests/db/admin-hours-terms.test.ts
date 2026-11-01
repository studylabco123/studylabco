import { afterAll, afterEach, beforeEach, describe, expect, test } from "vitest";
import { deleteAvailabilityRule, listAvailabilityRules, saveAvailabilityRule } from "@/lib/admin/hours-ops";
import { deleteTermPeriod, listTermPeriods, saveTermPeriod } from "@/lib/admin/terms-ops";
import { loadSlotData } from "@/lib/booking/data";
import { generateSlots } from "@/lib/calendar/slots";
import { periodFor } from "@/lib/calendar/periods";
import { getSettings } from "@/lib/settings";
import { closeDb, db } from "./setup";

/** resetData() leaves rules and terms alone, so each test snapshots and restores them. */
let rules: Record<string, unknown>[];
let terms: Record<string, unknown>[];
beforeEach(async () => {
  rules = (await db.query("select id, period, weekday, start_time::text as start_time, end_time::text as end_time, kinds::text[] as kinds, locations::text[] as locations from availability_rules")).rows;
  terms = (await db.query("select id, label, starts_on::text as starts_on, ends_on::text as ends_on from term_periods")).rows;
});
afterEach(async () => {
  await db.query("delete from availability_rules");
  await db.query("delete from term_periods");
  for (const r of rules)
    await db.query("insert into availability_rules (id, period, weekday, start_time, end_time, kinds, locations) values ($1,$2,$3,$4,$5,$6::booking_kind[],$7::location_kind[])", [r.id, r.period, r.weekday, r.start_time, r.end_time, r.kinds, r.locations]);
  for (const t of terms) await db.query("insert into term_periods (id, label, starts_on, ends_on) values ($1,$2,$3,$4)", [t.id, t.label, t.starts_on, t.ends_on]);
});
afterAll(closeDb);

const rule = (over: Partial<Parameters<typeof saveAvailabilityRule>[0]> = {}) => ({
  period: "holiday" as const,
  weekday: 6,
  startTime: "09:00",
  endTime: "12:00",
  kinds: ["assessment", "one_to_one"] as ("assessment" | "one_to_one")[],
  locations: ["tutor_place"] as ("tutor_place" | "home_visit" | "online")[],
  ...over,
});

describe("teaching hours", () => {
  test("rule with end before start refused", async () => {
    expect(await saveAvailabilityRule(rule({ startTime: "12:00", endTime: "09:00" }))).toEqual({ ok: false, message: "The end must be after the start." });
  });
  test("rule shorter than 60 min refused", async () => {
    const res = await saveAvailabilityRule(rule({ startTime: "09:00", endTime: "09:30" }));
    expect(res.ok).toBe(false);
  });
  test("times off the hour and half hour refused", async () => {
    expect((await saveAvailabilityRule(rule({ startTime: "09:10" }))).ok).toBe(false);
  });
  test("impossible times such as 09:60 or 24:00 refused", async () => {
    expect((await saveAvailabilityRule(rule({ startTime: "09:60" }))).ok).toBe(false);
    expect((await saveAvailabilityRule(rule({ endTime: "24:00" }))).ok).toBe(false);
  });
  test("no kinds or no locations refused", async () => {
    expect((await saveAvailabilityRule(rule({ kinds: [] }))).ok).toBe(false);
    expect((await saveAvailabilityRule(rule({ locations: [] }))).ok).toBe(false);
  });
  test("home_visit on Tuesday refused, on Sunday allowed", async () => {
    expect((await saveAvailabilityRule(rule({ weekday: 2, locations: ["home_visit"] }))).ok).toBe(false);
    expect((await saveAvailabilityRule(rule({ weekday: 0, startTime: "08:00", endTime: "10:00", locations: ["home_visit"] }))).ok).toBe(true);
  });
  test("overlapping term rule on Monday refused", async () => {
    // Seeded term Monday is 17:00-20:00.
    expect(await saveAvailabilityRule(rule({ period: "term", weekday: 1, startTime: "19:00", endTime: "21:00" }))).toEqual({
      ok: false,
      message: "That overlaps another time window on the same day.",
    });
    // Touching is fine.
    expect((await saveAvailabilityRule(rule({ period: "term", weekday: 1, startTime: "20:00", endTime: "21:00" }))).ok).toBe(true);
  });
  test("editing a rule does not clash with itself", async () => {
    const monday = (await listAvailabilityRules()).find((r) => r.period === "term" && r.weekday === 1)!;
    expect((await saveAvailabilityRule({ ...monday, id: monday.id, endTime: "21:00" })).ok).toBe(true);
    expect((await listAvailabilityRules()).find((r) => r.id === monday.id)?.endTime).toBe("21:00");
  });
  test("deleteAvailabilityRule removes it; unknown id refused", async () => {
    const monday = (await listAvailabilityRules()).find((r) => r.weekday === 1)!;
    expect(await deleteAvailabilityRule(monday.id)).toEqual({ ok: true });
    expect((await deleteAvailabilityRule(monday.id)).ok).toBe(false);
  });
  test("valid holiday Saturday 09:00-12:00 rule saved and generateSlots offers 09:00,10:00,11:00 that Saturday in a holiday", async () => {
    expect(await saveAvailabilityRule(rule())).toEqual({ ok: true });
    const saturday = "2027-04-03"; // between Spring 2b and Summer 1a: holiday
    const data = await loadSlotData(saturday, saturday);
    expect(periodFor(saturday, data.terms)).toBe("holiday");
    const slots = generateSlots({ ...data, now: new Date("2027-03-30T09:00:00Z"), fromDate: saturday, toDate: saturday, kind: "one_to_one", location: "tutor_place", settings: await getSettings() });
    expect(slots.map((s) => s.startsAt.toISOString().slice(11, 16))).toEqual(["08:00", "09:00", "10:00"]); // BST: 09:00-11:00 London
  });
});

describe("term periods", () => {
  const term = { label: "Test term", startsOn: "2027-08-01", endsOn: "2027-08-20" };
  test("saved, listed in date order", async () => {
    expect(await saveTermPeriod(term)).toEqual({ ok: true });
    const list = await listTermPeriods();
    expect(list.at(-1)).toMatchObject(term);
  });
  test("end before start refused; bad label refused", async () => {
    expect((await saveTermPeriod({ ...term, endsOn: "2027-07-31" })).ok).toBe(false);
    expect((await saveTermPeriod({ ...term, label: "  " })).ok).toBe(false);
    expect((await saveTermPeriod({ ...term, startsOn: "2027-02-31" })).ok).toBe(false);
  });
  test("term period overlap refused", async () => {
    // Summer 2 is 2027-06-07..2027-07-22.
    expect(await saveTermPeriod({ ...term, startsOn: "2027-07-22" })).toEqual({ ok: false, message: "Those dates overlap another term period." });
  });
  test("editing a term does not clash with itself", async () => {
    const summer2 = (await listTermPeriods()).find((t) => t.label === "Summer 2")!;
    expect((await saveTermPeriod({ ...summer2, endsOn: "2027-07-25" })).ok).toBe(true);
  });
  test("deleting a term period makes those dates holiday", async () => {
    const autumn2 = (await listTermPeriods()).find((t) => t.label === "Autumn 2")!;
    expect(periodFor("2026-11-10", await listTermPeriods())).toBe("term");
    expect(await deleteTermPeriod(autumn2.id)).toEqual({ ok: true });
    expect(periodFor("2026-11-10", await listTermPeriods())).toBe("holiday");
    expect((await deleteTermPeriod(autumn2.id)).ok).toBe(false);
  });
});
