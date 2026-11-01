import { describe, expect, test } from "vitest";
import { londonPeriods, quarterRanges, rangeFor, taxYearFor } from "@/lib/money/tax-year";

describe("taxYearFor", () => {
  test("mid year", () => {
    expect(taxYearFor("2026-11-01")).toEqual({ label: "2026-27", start: "2026-04-06", end: "2027-04-05" });
  });
  test("5 April is the last day of the old year", () => {
    expect(taxYearFor("2027-04-05").label).toBe("2026-27");
  });
  test("6 April starts the new year", () => {
    expect(taxYearFor("2027-04-06").label).toBe("2027-28");
  });
  test("early January belongs to the year that began the previous April", () => {
    expect(taxYearFor("2027-01-02").label).toBe("2026-27");
  });
  test("century rollover label", () => {
    expect(taxYearFor("2099-05-01").label).toBe("2099-00");
  });
});

describe("quarterRanges", () => {
  const q = quarterRanges("2026-27");
  test("four quarters", () => {
    expect(q.map((x) => x.q)).toEqual([1, 2, 3, 4]);
  });
  test("quarter 3 is 06 Oct to 05 Jan", () => {
    expect(q[2]).toEqual({ q: 3, start: "2026-10-06", end: "2027-01-05" });
  });
  test("first and last", () => {
    expect(q[0]).toEqual({ q: 1, start: "2026-04-06", end: "2026-07-05" });
    expect(q[1]).toEqual({ q: 2, start: "2026-07-06", end: "2026-10-05" });
    expect(q[3]).toEqual({ q: 4, start: "2027-01-06", end: "2027-04-05" });
  });
});

describe("rangeFor", () => {
  test("whole year", () => {
    expect(rangeFor("2026-27")).toEqual({ label: "2026-27", start: "2026-04-06", end: "2027-04-05", q: null });
  });
  test("a quarter", () => {
    expect(rangeFor("2026-27", 2)).toEqual({ label: "2026-27", start: "2026-07-06", end: "2026-10-05", q: 2 });
  });
  test("rejects nonsense", () => {
    expect(rangeFor("2026-28")).toBeNull();
    expect(rangeFor("abc")).toBeNull();
    expect(rangeFor("2026-27", 5 as never)).toBeNull();
  });
});

describe("londonPeriods", () => {
  test("week runs Monday to Sunday", () => {
    // Sunday 1 Nov 2026
    const p = londonPeriods("2026-11-01");
    expect(p.week).toEqual({ start: "2026-10-26", end: "2026-11-01" });
    expect(p.month).toEqual({ start: "2026-11-01", end: "2026-11-30" });
    expect(p.year).toEqual({ start: "2026-01-01", end: "2026-12-31" });
  });
});
