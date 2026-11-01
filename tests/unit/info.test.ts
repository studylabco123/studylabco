import { describe, expect, it } from "vitest";
import { COOLING_OFF_INFO, CREDIT_INFO, lateFeeInfo, locationInfo, typeInfo } from "@/lib/booking/info";

const s = {
  lateFeePercent: 50,
  cancellationNoticeHours: 48,
  travelFeePence: 500,
  allowedPostcodeDistricts: ["BB1", "BB2"],
  passValidityMonths: 6,
  passMinNoticeDays: 7,
};
const FORBIDDEN = /\b(fine|fines|penalty|penalties|waiver|waive)\b/i;

describe("info texts", () => {
  const all = [
    ...(["assessment", "one_to_one", "group", "sunday_bundle", "pass", "pass_session"] as const).flatMap((t) => [typeInfo(t, "KS3", s), typeInfo(t, "GCSE", s)]),
    ...(["tutor_place", "home_visit", "online"] as const).map((l) => locationInfo(l, s)),
    COOLING_OFF_INFO,
    lateFeeInfo(s),
    CREDIT_INFO,
  ];

  it("never use fine, penalty or waiver", () => {
    for (const t of all) expect(t).not.toMatch(FORBIDDEN);
  });

  it("the late fee is the set percentage of the lesson price, from the notice setting", () => {
    expect(lateFeeInfo(s)).toContain("50% of the lesson price");
    expect(lateFeeInfo(s)).toContain("48 hours");
    expect(lateFeeInfo({ ...s, lateFeePercent: 25, cancellationNoticeHours: 72 })).toContain("25% of the lesson price");
    expect(lateFeeInfo({ ...s, cancellationNoticeHours: 72 })).toContain("72 hours");
    expect(lateFeeInfo(s)).toMatch(/cooling-off/);
  });

  it("cooling-off is 14 days and always free", () => {
    expect(COOLING_OFF_INFO).toContain("14 days");
    expect(COOLING_OFF_INFO).toMatch(/free/);
  });

  it("credit can be refunded to the card by emailing", () => {
    expect(CREDIT_INFO).toContain("studylabco123@gmail.com");
    expect(CREDIT_INFO).toMatch(/refund/);
    expect(CREDIT_INFO).toMatch(/refund it to your bank account/);
    expect(CREDIT_INFO).not.toMatch(/card/i);
  });

  it("group texts name the level; Year 9 sits the GCSE assessment", () => {
    expect(typeInfo("group", "KS3", s)).toContain("KS3");
    expect(typeInfo("group", "KS3", s)).toContain("Years 7–9");
    expect(typeInfo("group", "GCSE", s)).toContain("GCSE");
    expect(typeInfo("assessment", "KS3", s)).toContain("Year 9");
  });

  it("cooling-off and credit texts mention group passes", () => {
    expect(COOLING_OFF_INFO).toMatch(/group pass/);
    expect(COOLING_OFF_INFO).toMatch(/unused sessions go back as account credit/);
    expect(CREDIT_INFO).toMatch(/group pass/);
  });

  it("pass texts explain payment, validity, notice, the 14-day rule and Sunday bundles", () => {
    const ks3 = typeInfo("pass", "KS3", s);
    expect(ks3).toContain("once we've received the payment");
    expect(ks3).toContain("6 months");
    expect(ks3).toContain("at least a week");
    expect(ks3).toContain("If you change your mind within 14 days of buying, unused sessions go back as credit");
    expect(ks3).not.toContain("Sunday bundle");
    expect(typeInfo("pass", "GCSE", s)).toContain("A Sunday bundle (both Sunday sessions) uses 2.");
    expect(typeInfo("pass", "KS3", { ...s, passMinNoticeDays: 10, passValidityMonths: 3 })).toMatch(/3 months.*at least 10 days/);
    const session = typeInfo("pass_session", "KS3", s);
    expect(session).toContain("goes back on your pass");
    expect(session).toContain("50% of one session's value");
  });

  it("home visit text gives the travel fee and postcodes", () => {
    expect(locationInfo("home_visit", s)).toContain("£5");
    expect(locationInfo("home_visit", s)).toContain("BB1 and BB2");
  });
});
