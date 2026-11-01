import { describe, expect, it } from "vitest";
import { approvedTypes, sessionsForLevel, typeDetails } from "@/app/account/book/steps/options";
import type { SessionOption, WizardSettings } from "@/app/account/book/types";

const settings: WizardSettings = {
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
  cancellationNoticeHours: 48,
  passValidityMonths: 6,
  passMinNoticeDays: 7,
  homeVisitBufferMinutes: 30,
  allowedPostcodeDistricts: ["BB1", "BB2"],
  groupVenue: null,
  lessonLocations: ["tutor_place", "home_visit"],
};

const session = (over: Partial<SessionOption>): SessionOption => ({
  id: "s",
  title: "Group",
  startsAt: "2026-11-07T10:00:00.000Z",
  endsAt: "2026-11-07T11:00:00.000Z",
  seatsLeft: 5,
  pricePence: 1800,
  venue: null,
  product: null,
  level: "GCSE",
  passBookable: true,
  ...over,
});
const sat = session({ id: "sat", title: "Saturday KS3 Science Group", pricePence: 1400, product: "saturday", level: "KS3" });
const sun = session({ id: "sun", title: "Sunday GCSE Group", product: "sunday_bundle", level: "GCSE" });

describe("wizard options by level", () => {
  it("KS3 gets 1-to-1, KS3 groups and a group pass but no Sunday bundle; GCSE also the Sunday bundle", () => {
    expect(approvedTypes("KS3")).toEqual(["one_to_one", "group", "pass"]);
    expect(approvedTypes("GCSE")).toEqual(["one_to_one", "group", "sunday_bundle", "pass"]);
  });

  it("group sessions are filtered to the child's level", () => {
    expect(sessionsForLevel([sat, sun], "KS3").map((s) => s.id)).toEqual(["sat"]);
    expect(sessionsForLevel([sat, sun], "GCSE").map((s) => s.id)).toEqual(["sun"]);
  });

  it("prices come from quote with the level", () => {
    const ks3 = typeDetails({ level: "KS3", schoolYear: 8 }, settings, [sat]);
    expect(ks3.one_to_one).toBe("60 minutes, £20 (home visit £25).");
    expect(ks3.assessment).toContain("£7.50 (home visit £12.50)");
    expect(ks3.group).toBe("One 60-minute group session, £14.");
    expect(ks3.pass).toBe("6 KS3 group sessions for £79, or 10 for £126. Book them over 6 months.");
    // Year 9 always sits the GCSE assessment.
    expect(typeDetails({ level: "KS3", schoolYear: 9 }, settings, [sat]).assessment).toContain("£10 (home visit £15)");
    const gcse = typeDetails({ level: "GCSE", schoolYear: 10 }, settings, [sun]);
    expect(gcse.one_to_one).toBe("60 minutes, £25 (home visit £30).");
    expect(gcse.pass).toBe("6 GCSE group sessions for £102, or 10 for £162. Book them over 6 months.");
  });
});
