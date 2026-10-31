import { describe, expect, it } from "vitest";
import { checkEligibility, IneligibleMessage, type EligibilityCtx } from "@/lib/booking/eligibility";
import { SETTINGS } from "./fixtures";

const base = (over: Partial<EligibilityCtx> = {}): EligibilityCtx => ({
  profile: { isBlocked: false },
  owedPence: 0,
  hasAgreement: true,
  assessmentBooked: true,
  approved: true,
  request: { type: "group" },
  settings: SETTINGS,
  ...over,
});

describe("checkEligibility", () => {
  it("blocked account is checked first", () => {
    expect(checkEligibility(base({ profile: { isBlocked: true }, owedPence: 100, hasAgreement: false }))).toEqual({ ok: false, reason: "account_blocked" });
  });
  it("owed > 0 -> money_owed", () => {
    expect(checkEligibility(base({ owedPence: 1, hasAgreement: false }))).toEqual({ ok: false, reason: "money_owed" });
  });
  it("no agreement -> agreement_missing", () => {
    expect(checkEligibility(base({ hasAgreement: false }))).toEqual({ ok: false, reason: "agreement_missing" });
  });
  it("one_to_one before approval (assessment booked) -> not_approved", () => {
    expect(checkEligibility(base({ approved: false, request: { type: "one_to_one", location: "tutor_place" } }))).toEqual({ ok: false, reason: "not_approved" });
  });
  it("group before approval (assessment booked) -> not_approved", () => {
    expect(checkEligibility(base({ approved: false }))).toEqual({ ok: false, reason: "not_approved" });
  });
  it("no assessment booked and not approved -> assessment_required", () => {
    for (const type of ["one_to_one", "group", "sunday_bundle", "block"] as const) {
      expect(checkEligibility(base({ approved: false, assessmentBooked: false, request: { type, location: "tutor_place" } }))).toEqual({ ok: false, reason: "assessment_required" });
    }
  });
  it("assessment for unapproved child at tutor_place is ok", () => {
    expect(checkEligibility(base({ approved: false, assessmentBooked: false, request: { type: "assessment", location: "tutor_place" } }))).toEqual({ ok: true });
  });
  it("assessment online -> assessment_in_person_only", () => {
    expect(checkEligibility(base({ approved: false, request: { type: "assessment", location: "online" } }))).toEqual({ ok: false, reason: "assessment_in_person_only" });
  });
  it("home_visit on Tuesday -> home_visit_sunday_only", () => {
    expect(checkEligibility(base({ request: { type: "one_to_one", location: "home_visit", londonWeekday: 2, postcode: "BB1 1AA" } }))).toEqual({ ok: false, reason: "home_visit_sunday_only" });
  });
  it("home_visit postcode BB3 -> postcode_not_allowed", () => {
    expect(checkEligibility(base({ request: { type: "one_to_one", location: "home_visit", londonWeekday: 0, postcode: "BB3 1AA" } }))).toEqual({ ok: false, reason: "postcode_not_allowed" });
  });
  it("home_visit on Sunday with allowed postcode is ok", () => {
    expect(checkEligibility(base({ request: { type: "one_to_one", location: "home_visit", londonWeekday: 0, postcode: "BB2 4HP" } }))).toEqual({ ok: true });
  });
  it("home_visit for group is not valid", () => {
    expect(checkEligibility(base({ request: { type: "group", location: "home_visit", londonWeekday: 0, postcode: "BB1 1AA" } })).ok).toBe(false);
  });
  it("online one_to_one while disabled -> online_disabled", () => {
    expect(checkEligibility(base({ request: { type: "one_to_one", location: "online" } }))).toEqual({ ok: false, reason: "online_disabled" });
  });
  it("disabled tutor_place -> location_disabled", () => {
    expect(checkEligibility(base({ settings: { ...SETTINGS, tutorPlaceEnabled: false }, request: { type: "one_to_one", location: "tutor_place" } }))).toEqual({ ok: false, reason: "location_disabled" });
  });
  it("disabled home visits -> location_disabled", () => {
    expect(checkEligibility(base({ settings: { ...SETTINGS, homeVisitsEnabled: false }, request: { type: "one_to_one", location: "home_visit", londonWeekday: 0, postcode: "BB1 1AA" } }))).toEqual({ ok: false, reason: "location_disabled" });
  });
  it("approved child, group -> ok", () => {
    expect(checkEligibility(base())).toEqual({ ok: true });
  });
});

describe("IneligibleMessage", () => {
  it("has exact copy and avoids banned words", () => {
    expect(IneligibleMessage.postcode_not_allowed).toBe("We only visit BB1 and BB2 postcodes.");
    expect(IneligibleMessage.assessment_required).toBe("Each child starts with a £10 Assessment Lesson.");
    expect(IneligibleMessage.money_owed).toBe("You have an unpaid balance. Please pay it before booking again.");
    expect(IneligibleMessage.account_blocked).toBe("Please contact Study Lab Co.");
    for (const [k, m] of Object.entries(IneligibleMessage)) {
      expect(m).not.toMatch(/\b(fine|penalty)\b/i);
      if (k !== "online_disabled") expect(m).not.toMatch(/online/i);
    }
  });
});
