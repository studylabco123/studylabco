import { describe, expect, it } from "vitest";
import { bookingWindowText } from "@/lib/policy";
import { coolingOffSummary, passSummary, priceInfo } from "@/lib/public/price-info";
import { groupDaysByLevel, groupTimesByDay, lessonPrices, passOffers } from "@/lib/public/prices";
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
      ks3Assessment: 750,
      ks3AssessmentHome: 1250,
      ks3OneToOne: 2000,
      ks3OneToOneHome: 2500,
      ks3Group: 1400,
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

/**
 * v2 §6: the claims removed in 0fb9537 are restored, except the Terms line charging for a lesson
 * ended early and the vague privacy retention period (kept removed for legal reasons).
 */
describe("public copy: restored claims (v2 §6)", () => {
  const files = [
    "src/app/(public)/page.tsx",
    "src/app/(public)/about/page.tsx",
    "src/app/(public)/safeguarding/page.tsx",
    "src/app/(public)/terms/page.tsx",
    "src/app/(public)/privacy/page.tsx",
    "src/components/site/HowItWorks.tsx",
  ];
  const all = files.map((f) => readFileSync(f, "utf8")).join("\n");
  it.each(["what examiners look for", "without waiting for a", "what we covered", "never passed to anyone else", "about five minutes"])(
    "says %j again",
    (phrase) => expect(all).toContain(phrase),
  );
  it.each(["still due for a lesson ended", "a reasonable period"])("still does not say %j", (phrase) => expect(all).not.toContain(phrase));
  it("gives a concrete period for keeping agreement forms", () => {
    expect(all).toContain("up to 12 months after your child stops lessons");
  });
});

describe("plain-English explanations", () => {
  it("explain a group pass and the 14-day right with numbers from settings", () => {
    expect(passSummary(fixtureSettings())).toBe(
      "Buy 6 or 10 group sessions upfront at a discount, then book the dates you want — at least a week ahead — within 6 months. Miss one with 48 hours' notice and the session goes back on your pass.",
    );
    expect(coolingOffSummary(fixtureSettings())).toBe(
      "By law, you have 14 days after booking (or buying a pass) to change your mind. Cancel within those 14 days and it's free — even if the lesson is less than 48 hours away. For a pass, unused sessions become account credit.",
    );
    const s = fixtureSettings();
    s.passMinNoticeDays = 10;
    s.passValidityMonths = 3;
    expect(passSummary(s)).toContain("at least 10 days ahead — within 3 months");
  });
  it("never says fine, penalty or waiver", () => {
    const s = fixtureSettings();
    const texts = [
      passSummary(s),
      coolingOffSummary(s),
      ...(["KS3", "GCSE"] as const).flatMap((l) => [priceInfo.assessment(l), priceInfo.oneToOne(l), priceInfo.group(l), priceInfo.pass(l, 6, 7900, s)]),
      priceInfo.homeVisit(s),
      priceInfo.sundayBundle(s),
    ];
    for (const t of texts) expect(t).not.toMatch(/\bfines?\b|penalt|waiver/i);
  });
});

describe("groupDaysByLevel", () => {
  it("says which level each group day is for", () => {
    expect(
      groupDaysByLevel([
        { weekday: 0, active: true, level: "GCSE" },
        { weekday: 6, active: true, level: "KS3" },
        { weekday: 3, active: false, level: "KS3" },
      ]),
    ).toBe("Saturday: KS3 only (Years 7–9). Sunday: GCSE (Years 10–11; Year 9 GCSE students welcome).");
  });
});
