import { describe, expect, test } from "vitest";
import { summarise } from "@/app/account/book/steps/summary";
import type { WizardData } from "@/app/account/book/types";

const data: WizardData = {
  children: [{ id: "c1", name: "Sam Parent", hasAgreement: true, approved: true, assessmentBooked: true }],
  settings: {
    priceAssessmentPence: 1000,
    priceOneToOnePence: 2500,
    priceGroupPence: 1800,
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
  test("home-visit late cancellation fee is the lesson price only (R11); total includes travel", () => {
    const s = summarise(
      { childId: "c1", type: "one_to_one", location: "home_visit", homeAddress: "1 Road", postcode: "BB1 1AA", slot: "2026-11-08T10:30:00.000Z" },
      data,
    );
    expect(s?.totalPence).toBe(3000);
    expect(s?.feePence).toBe(2500);
    expect(s?.lines).toEqual([
      { label: "1-to-1 lesson", pence: 2500 },
      { label: "Travel fee", pence: 500 },
    ]);
  });

  test("tutor's place fee equals the price", () => {
    const s = summarise({ childId: "c1", type: "assessment", location: "tutor_place", slot: "2026-11-02T17:00:00.000Z" }, data);
    expect(s?.feePence).toBe(1000);
    expect(s?.totalPence).toBe(1000);
  });
});
