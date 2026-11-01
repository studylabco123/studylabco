import { describe, expect, it } from "vitest";
import { assessmentLevel } from "@/lib/booking/level";
import { quote } from "@/lib/booking/pricing";
import { SETTINGS } from "./fixtures";

describe("quote", () => {
  it("assessment tutor_place = 1000", () => {
    expect(quote({ type: "assessment", level: "GCSE", location: "tutor_place" }, SETTINGS).totalPence).toBe(1000);
  });
  it("assessment home_visit = 1500 (base 1000, travel 500)", () => {
    const q = quote({ type: "assessment", level: "GCSE", location: "home_visit" }, SETTINGS);
    expect(q).toMatchObject({ basePence: 1000, travelPence: 500, totalPence: 1500 });
  });
  it("1-to-1 home_visit = 3000", () => {
    expect(quote({ type: "one_to_one", level: "GCSE", location: "home_visit" }, SETTINGS).totalPence).toBe(3000);
  });
  it("group = 1800", () => {
    expect(quote({ type: "group", level: "GCSE" }, SETTINGS).totalPence).toBe(1800);
  });
  it("sunday_bundle = 3000 split [1500,1500]", () => {
    const q = quote({ type: "sunday_bundle" }, SETTINGS);
    expect(q.totalPence).toBe(3000);
    expect(q.perBookingPence).toEqual([1500, 1500]);
  });
  it("puts the remainder on the first booking", () => {
    const s = { ...SETTINGS, passPrices: { ...SETTINGS.passPrices, GCSE: { "6": 10201, "10": 16200 } } };
    const q = quote({ type: "pass", level: "GCSE", sessions: 6 }, s);
    expect(q.perBookingPence).toEqual([1701, 1700, 1700, 1700, 1700, 1700]);
  });
  it("KS3 assessment = 750; Year 8 home visit = 1250; Year 9 (GCSE level) = 1000", () => {
    expect(quote({ type: "assessment", level: "KS3", location: "tutor_place" }, SETTINGS).totalPence).toBe(750);
    expect(quote({ type: "assessment", level: "KS3", location: "home_visit" }, SETTINGS).totalPence).toBe(1250);
    expect(quote({ type: "assessment", level: assessmentLevel(9, "KS3"), location: "tutor_place" }, SETTINGS).totalPence).toBe(1000);
  });
  it("1-to-1: KS3 = 2000 (home visit 2500), GCSE = 2500", () => {
    expect(quote({ type: "one_to_one", level: "KS3", location: "tutor_place" }, SETTINGS).totalPence).toBe(2000);
    expect(quote({ type: "one_to_one", level: "KS3", location: "home_visit" }, SETTINGS).totalPence).toBe(2500);
    expect(quote({ type: "one_to_one", level: "GCSE", location: "tutor_place" }, SETTINGS).totalPence).toBe(2500);
  });
  it("KS3 group = 1400", () => {
    expect(quote({ type: "group", level: "KS3" }, SETTINGS).totalPence).toBe(1400);
  });
  it("pass KS3 6 = 7900, the remainder (4p) on the first booking", () => {
    const q = quote({ type: "pass", level: "KS3", sessions: 6 }, SETTINGS);
    expect(q.totalPence).toBe(7900);
    expect(q.perBookingPence).toEqual([1320, 1316, 1316, 1316, 1316, 1316]);
    expect(q.perBookingPence.reduce((a, b) => a + b, 0)).toBe(7900);
  });
  it("other passes use their level and size", () => {
    expect(quote({ type: "pass", level: "KS3", sessions: 10 }, SETTINGS).totalPence).toBe(12600);
    expect(quote({ type: "pass", level: "GCSE", sessions: 6 }, SETTINGS).totalPence).toBe(10200);
    expect(quote({ type: "pass", level: "GCSE", sessions: 10 }, SETTINGS).totalPence).toBe(16200);
  });
});
