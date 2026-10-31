import { describe, expect, test } from "vitest";
import { generateSlots } from "@/lib/calendar/slots";
import { formatLondon } from "@/lib/format";
import type { LocationKind, Settings } from "@/lib/types";
import { CHRISTMAS, RULES, SETTINGS, TERMS, WEDNESDAY_RULE } from "./fixtures";

const NOW = new Date("2026-10-31T12:00:00Z");

function run(
  date: string,
  opts: {
    location?: LocationKind;
    kind?: "assessment" | "one_to_one";
    settings?: Partial<Settings>;
    now?: Date;
    toDate?: string;
    busy?: { start: Date; end: Date }[];
    blocks?: Parameters<typeof generateSlots>[0]["blocks"];
    blockRules?: Parameters<typeof generateSlots>[0]["blockRules"];
  } = {},
) {
  return generateSlots({
    now: opts.now ?? NOW,
    fromDate: date,
    toDate: opts.toDate ?? date,
    kind: opts.kind ?? "one_to_one",
    location: opts.location ?? "tutor_place",
    settings: { ...SETTINGS, bookingWindowDays: 400, ...opts.settings },
    rules: RULES,
    terms: TERMS,
    blocks: opts.blocks ?? [],
    blockRules: opts.blockRules ?? [],
    busy: opts.busy ?? [],
  });
}

const starts = (s: { startsAt: Date }[]) => s.map((x) => x.startsAt.toISOString());
const local = (s: { startsAt: Date }[]) => s.map((x) => formatLondon(x.startsAt, "HH:mm"));

describe("generateSlots", () => {
  test("term Tuesday tutor_place gives 17:00, 18:00, 19:00", () => {
    const s = run("2026-11-03");
    expect(local(s)).toEqual(["17:00", "18:00", "19:00"]);
    expect(starts(s)).toEqual([
      "2026-11-03T17:00:00.000Z",
      "2026-11-03T18:00:00.000Z",
      "2026-11-03T19:00:00.000Z",
    ]);
    expect(s[0].endsAt.toISOString()).toBe("2026-11-03T18:00:00.000Z");
  });

  test("holiday Monday gives 15 slots 07:00..21:00", () => {
    const s = run("2026-12-21");
    expect(s).toHaveLength(15);
    expect(local(s)[0]).toBe("07:00");
    expect(local(s)[14]).toBe("21:00");
  });

  test("Sunday gives 7 slots 10:30..16:30", () => {
    const s = run("2026-11-08");
    expect(s).toHaveLength(7);
    expect(local(s)[0]).toBe("10:30");
    expect(local(s)[6]).toBe("16:30");
  });

  test("Saturday has no 1-to-1 slots", () => {
    expect(run("2026-11-07")).toEqual([]);
  });

  test("Christmas Day blocked gives none", () => {
    expect(run("2026-12-25", { blocks: [CHRISTMAS] })).toEqual([]);
  });

  test("handles BST start: Sunday 2027-03-28 first slot is 09:30Z", () => {
    expect(starts(run("2027-03-28"))[0]).toBe("2027-03-28T09:30:00.000Z");
  });

  test("handles GMT return: Sunday 2026-10-25 first slot is 10:30Z", () => {
    const s = run("2026-10-25", { now: new Date("2026-10-20T12:00:00Z") });
    expect(starts(s)[0]).toBe("2026-10-25T10:30:00.000Z");
  });

  test("online excluded while online_enabled false", () => {
    expect(run("2026-11-03", { location: "online" })).toEqual([]);
    expect(run("2026-11-03", { location: "online", settings: { onlineEnabled: true } })).toHaveLength(3);
  });

  test("tutor place excluded when disabled", () => {
    expect(run("2026-11-03", { settings: { tutorPlaceEnabled: false } })).toEqual([]);
  });

  test("home_visit only on Sunday", () => {
    expect(run("2026-11-03", { location: "home_visit" })).toEqual([]);
    expect(run("2026-11-08", { location: "home_visit" })).toHaveLength(7);
    expect(run("2026-11-08", { location: "home_visit", settings: { homeVisitsEnabled: false } })).toEqual([]);
  });

  test("home visit needs 30 min after", () => {
    const busy = [
      { start: new Date("2026-11-08T11:30:00Z"), end: new Date("2026-11-08T12:30:00Z") },
    ];
    expect(local(run("2026-11-08", { location: "home_visit", busy }))).not.toContain("10:30");
    expect(local(run("2026-11-08", { location: "tutor_place", busy }))).toContain("10:30");
  });

  test("busy interval is half-open", () => {
    const busy = [
      { start: new Date("2026-11-03T18:00:00Z"), end: new Date("2026-11-03T19:00:00Z") },
    ];
    expect(local(run("2026-11-03", { busy }))).toEqual(["17:00", "19:00"]);
  });

  test("respects 24h minimum notice", () => {
    const s = run("2026-11-03", { now: new Date("2026-11-02T18:30:00Z") });
    expect(local(s)).toEqual(["19:00"]);
  });

  test("respects 28-day window", () => {
    const now = new Date("2026-11-03T12:00:00Z");
    const s = run("2026-11-30", {
      toDate: "2026-12-03",
      now,
      settings: { bookingWindowDays: 28 },
    });
    // window closes 2026-12-01T12:00Z; 2026-12-01 17:00 is out.
    expect(s.every((x) => x.startsAt.getTime() <= now.getTime() + 28 * 86400000)).toBe(true);
    expect(s.some((x) => x.startsAt.toISOString().startsWith("2026-11-30"))).toBe(true);
    expect(s.some((x) => x.startsAt.toISOString().startsWith("2026-12-01"))).toBe(false);
  });

  test("blocked rule every Wednesday 17:00-18:00 removes Wednesday 17:00 only", () => {
    const s = run("2026-11-04", { blockRules: [WEDNESDAY_RULE] });
    expect(local(s)).toEqual(["18:00", "19:00"]);
    expect(local(run("2026-11-05", { blockRules: [WEDNESDAY_RULE] }))).toHaveLength(3);
  });

  test("blocked rule respects valid_from / valid_to", () => {
    const r = { ...WEDNESDAY_RULE, validFrom: "2026-11-11", validTo: "2026-11-11" };
    expect(run("2026-11-04", { blockRules: [r] })).toHaveLength(3);
    expect(run("2026-11-11", { blockRules: [r] })).toHaveLength(2);
    expect(run("2026-11-18", { blockRules: [r] })).toHaveLength(3);
  });

  test("kind must be in the rule's kinds", () => {
    const rules = RULES.map((r) => ({ ...r, kinds: ["assessment" as const] }));
    const s = generateSlots({
      now: NOW, fromDate: "2026-11-03", toDate: "2026-11-03", kind: "one_to_one",
      location: "tutor_place", settings: SETTINGS, rules, terms: TERMS,
      blocks: [], blockRules: [], busy: [],
    });
    expect(s).toEqual([]);
  });
});
