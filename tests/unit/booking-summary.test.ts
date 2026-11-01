import { describe, expect, test } from "vitest";
import { groupPriceText } from "@/app/account/book/steps/labels";
import { cancellationTerms, summarise } from "@/app/account/book/steps/summary";
import type { WizardData } from "@/app/account/book/types";

const data: WizardData = {
  children: [{ id: "c1", name: "Sam Parent", level: "GCSE", schoolYear: 10, hasAgreement: true, approved: true, assessmentBooked: true }],
  settings: {
    priceAssessmentPence: 1000,
    priceOneToOnePence: 2500,
    priceGroupPence: 1800,
    priceKs3AssessmentPence: 750,
    priceKs3OneToOnePence: 2000,
    priceKs3GroupPence: 1400,
    lateFeePercent: 50,
    passPrices: { KS3: { "6": 7900, "10": 12600 }, GCSE: { "6": 10200, "10": 16200 } },
    priceSundayBundlePence: 3000,
    travelFeePence: 500,
    blockPrices: { saturday: { 6: 10200, 10: 16200 }, sunday_bundle: { 6: 17100, 10: 27000 } },
    cancellationNoticeHours: 48,
    homeVisitBufferMinutes: 30,
    allowedPostcodeDistricts: ["BB1", "BB2"],
    groupVenue: null,
    lessonLocations: ["tutor_place", "home_visit"],
  },
  familyMessage: null,
  sessions: [],
};

describe("booking summary", () => {
  test("home-visit late cancellation fee is 50% of the lesson price (no travel); total includes travel", () => {
    const s = summarise(
      { childId: "c1", type: "one_to_one", location: "home_visit", homeAddress: "1 Road", postcode: "BB1 1AA", slot: "2026-11-08T10:30:00.000Z" },
      data,
    );
    expect(s?.totalPence).toBe(3000);
    expect(s?.feePence).toBe(1250);
    expect(s?.lines).toEqual([
      { label: "1-to-1 lesson", pence: 2500 },
      { label: "Travel fee", pence: 500 },
    ]);
  });

  test("a single group seat shows the session's own price (R17)", () => {
    const session = { id: "s1", title: "Wed Group", startsAt: "2026-11-04T17:30:00.000Z", endsAt: "2026-11-04T18:30:00.000Z", seatsLeft: 5, pricePence: 1250, venue: null, product: null };
    const s = summarise({ childId: "c1", type: "group", sessionId: "s1" }, { ...data, sessions: [session] });
    expect(s?.totalPence).toBe(1250);
    expect(s?.lines).toEqual([{ label: "Group session", pence: 1250 }]);
    expect(s?.feePence).toBe(625);
  });

  test("tutor's place fee is 50% of the price", () => {
    const s = summarise({ childId: "c1", type: "assessment", location: "tutor_place", slot: "2026-11-02T17:00:00.000Z" }, data);
    expect(s?.feePence).toBe(500);
    expect(s?.totalPence).toBe(1000);
  });
});

describe("cancellationTerms (cooling-off, Ruling R20)", () => {
  const start = new Date("2026-12-01T17:00:00Z");
  const D = 86_400_000;
  test("a lesson more than 14 days away keeps the 48-hour deadline and mentions the cooling-off", () => {
    const t = cancellationTerms(start, 48, false, new Date(start.getTime() - 20 * D));
    expect(t.rule).toBe(
      "You can cancel for free up to 48 hours before the lesson, and at any time in the first 14 days after booking (your cooling-off period).",
    );
    expect(t.deadline).toEqual(new Date(start.getTime() - 48 * 3600_000));
    expect(t.coolingOffCovers).toBeNull();
  });
  test("a lesson 15 days away: free until the cooling-off ends, a day before the lesson", () => {
    const bookedAt = new Date(start.getTime() - 15 * D);
    expect(cancellationTerms(start, 48, false, bookedAt).deadline).toEqual(new Date(bookedAt.getTime() + 14 * D));
  });
  test("a lesson within 14 days is free to cancel until it starts", () => {
    const t = cancellationTerms(start, 48, true, new Date(start.getTime() - 5 * D));
    expect(t.deadline).toBeNull();
    expect(t.coolingOffCovers).toBe(
      "The first session starts within your 14-day cooling-off period, so you can cancel it for free at any time before it starts.",
    );
  });
});

describe("groupPriceText", () => {
  const session = (pricePence: number, seatsLeft = 5) => ({
    id: `s${pricePence}-${seatsLeft}`,
    title: "Saturday group",
    startsAt: "2026-11-07T10:00:00.000Z",
    endsAt: "2026-11-07T11:00:00.000Z",
    seatsLeft,
    pricePence,
    venue: null,
    product: "saturday" as const,
  });
  test("quotes each session's own price, not the global default", () => {
    expect(groupPriceText([session(1250), session(1250)])).toBe("£12.50");
    expect(groupPriceText([session(1500), session(1000)])).toBe("from £10");
  });
  test("ignores full sessions, and gives no price when none is open", () => {
    expect(groupPriceText([session(800, 0), session(1500)])).toBe("£15");
    expect(groupPriceText([])).toBeNull();
  });
});
