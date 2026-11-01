import { describe, expect, it } from "vitest";
import { bookingWindowText } from "@/lib/policy";
import { groupTimesByDay, lessonPrices, passOffers } from "@/lib/public/prices";
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

describe("passOffers", () => {
  it("shows each group pass with its saving against booking sessions one by one", () => {
    expect(passOffers(fixtureSettings())).toEqual([
      { level: "KS3", sessions: 6, pricePence: 7900, singlePence: 8400, savingPence: 500 },
      { level: "KS3", sessions: 10, pricePence: 12600, singlePence: 14000, savingPence: 1400 },
      { level: "GCSE", sessions: 6, pricePence: 10200, singlePence: 10800, savingPence: 600 },
      { level: "GCSE", sessions: 10, pricePence: 16200, singlePence: 18000, savingPence: 1800 },
    ]);
  });
  it("never shows a negative saving", () => {
    const s = fixtureSettings();
    s.passPrices.KS3["6"] = 20000;
    expect(passOffers(s)[0].savingPence).toBe(0);
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
  });
});

import { readFileSync } from "node:fs";

/** Ruling R24: unverified claims removed or softened until the owner confirms them. */
describe("public copy makes no unverified claims", () => {
  const files = [
    "src/app/(public)/page.tsx",
    "src/app/(public)/about/page.tsx",
    "src/app/(public)/safeguarding/page.tsx",
    "src/app/(public)/terms/page.tsx",
    "src/app/(public)/privacy/page.tsx",
    "src/components/site/HowItWorks.tsx",
  ];
  const all = files.map((f) => readFileSync(f, "utf8")).join("\n");
  it.each([
    "what examiners look for",
    "without waiting for a reply",
    "what we covered",
    "never passed to anyone else",
    "about five minutes",
    "still due for a lesson ended",
    "a reasonable period",
  ])("does not say %j", (phrase) => expect(all).not.toContain(phrase));
  it("gives a concrete period for keeping agreement forms", () => {
    expect(all).toContain("up to 12 months after your child stops lessons");
  });
});
