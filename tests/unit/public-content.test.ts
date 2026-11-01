import { describe, expect, it } from "vitest";
import { BLOCK_HOLD_HOURS, bookingWindowText } from "@/lib/policy";
import { blockOffers, groupTimesByDay, lessonPrices } from "@/lib/public/prices";
import { SETTINGS } from "./fixtures";

const fixtureSettings = () => structuredClone(SETTINGS);

describe("lessonPrices", () => {
  it("reads every price from settings, adding the travel fee for home visits", () => {
    const p = lessonPrices(fixtureSettings());
    expect(p).toMatchObject({
      assessment: 1000,
      assessmentHome: 1500,
      oneToOne: 2500,
      oneToOneHome: 3000,
      group: 1800,
      sundayBundle: 3000,
      travel: 500,
    });
  });
});

describe("blockOffers", () => {
  it("shows each block with its saving against booking week by week", () => {
    const offers = blockOffers(fixtureSettings());
    expect(offers).toEqual([
      { product: "saturday", weeks: 6, pricePence: 10200, weeklyPence: 10800, savingPence: 600 },
      { product: "saturday", weeks: 10, pricePence: 16200, weeklyPence: 18000, savingPence: 1800 },
      { product: "sunday_bundle", weeks: 6, pricePence: 17100, weeklyPence: 18000, savingPence: 900 },
      { product: "sunday_bundle", weeks: 10, pricePence: 27000, weeklyPence: 30000, savingPence: 3000 },
    ]);
  });
  it("never shows a negative saving", () => {
    const s = fixtureSettings();
    s.blockPrices.saturday[6] = 20000;
    expect(blockOffers(s)[0].savingPence).toBe(0);
  });
});

describe("groupTimesByDay", () => {
  it("lists active weekly group start times per day as 12-hour times", () => {
    expect(
      groupTimesByDay([
        { weekday: 0, startTime: "09:15:00", active: true },
        { weekday: 6, startTime: "08:15:00", active: true },
        { weekday: 0, startTime: "08:15:00", active: true },
        { weekday: 3, startTime: "18:00:00", active: false },
      ]),
    ).toEqual({ 6: ["8:15am"], 0: ["8:15am", "9:15am"] });
  });
});

describe("bookingWindowText", () => {
  it("whole weeks read as weeks, anything else as days", () => {
    expect(bookingWindowText(28)).toBe("4 weeks");
    expect(bookingWindowText(7)).toBe("1 week");
    expect(bookingWindowText(30)).toBe("30 days");
    expect(BLOCK_HOLD_HOURS).toBe(72);
  });
});
