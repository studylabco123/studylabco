import type { Level, LocationKind, Settings } from "@/lib/types";
import { isAllowedPostcode } from "./postcode";

export type IneligibleReason =
  | "account_blocked"
  | "money_owed"
  | "agreement_missing"
  | "assessment_required"
  | "not_approved"
  | "assessment_in_person_only"
  | "online_disabled"
  | "location_disabled"
  | "home_visit_sunday_only"
  | "postcode_not_allowed"
  | "level_mismatch"
  /** Not returned by checkEligibility; the booking service checks it (Ruling R9). */
  | "assessment_already_booked";

export interface EligibilityCtx {
  profile: { isBlocked: boolean };
  owedPence: number;
  hasAgreement: boolean;
  assessmentBooked: boolean;
  approved: boolean;
  /** The child's level (KS3 or GCSE). */
  childLevel: Level;
  request: {
    type: "assessment" | "one_to_one" | "group" | "sunday_bundle" | "pass";
    location?: LocationKind;
    londonWeekday?: number;
    postcode?: string;
    /** The level of the group session being booked, when known. */
    sessionLevel?: Level;
  };
  settings: Settings;
}

export type Eligibility = { ok: true } | { ok: false; reason: IneligibleReason };

const no = (reason: IneligibleReason): Eligibility => ({ ok: false, reason });

export function checkEligibility(ctx: EligibilityCtx): Eligibility {
  const { profile, owedPence, hasAgreement, assessmentBooked, approved, request, settings } = ctx;
  if (profile.isBlocked) return no("account_blocked");
  if (owedPence > 0) return no("money_owed");
  if (!hasAgreement) return no("agreement_missing");

  const { type, location } = request;

  if (type === "assessment") {
    if (location !== "tutor_place" && location !== "home_visit") return no("assessment_in_person_only");
  } else if (!approved) {
    return no(assessmentBooked ? "not_approved" : "assessment_required");
  }

  // A group session is only for its own key stage.
  if (request.sessionLevel && request.sessionLevel !== ctx.childLevel) return no("level_mismatch");

  if (location === "online" && !settings.onlineEnabled) return no("online_disabled");
  if (location === "tutor_place" && !settings.tutorPlaceEnabled) return no("location_disabled");
  if (location === "home_visit") {
    // Home visits only exist for assessments and 1-to-1 lessons.
    if (type !== "assessment" && type !== "one_to_one") return no("location_disabled");
    if (!settings.homeVisitsEnabled) return no("location_disabled");
    if (request.londonWeekday !== 0) return no("home_visit_sunday_only");
    if (!isAllowedPostcode(request.postcode ?? "", settings.allowedPostcodeDistricts)) {
      return no("postcode_not_allowed");
    }
  }
  return { ok: true };
}

/** Parent-facing copy. Online is hidden from parents at launch, so keep it generic. */
export const IneligibleMessage: Record<IneligibleReason, string> = {
  account_blocked: "Please contact Study Lab Co.",
  money_owed: "You have an unpaid balance. Please pay it before booking again.",
  agreement_missing: "Please read and accept the booking agreement first.",
  assessment_required: "Each child starts with an Assessment Lesson.",
  not_approved: "Your child's Assessment Lesson needs to happen before booking this.",
  assessment_in_person_only: "The Assessment Lesson takes place in person.",
  online_disabled: "That lesson type isn't available right now.",
  location_disabled: "That location isn't available right now.",
  home_visit_sunday_only: "Home visits are only available on Sundays.",
  postcode_not_allowed: "We only visit BB1 and BB2 postcodes.",
  level_mismatch: "That session is for a different key stage.",
  assessment_already_booked: "This child already has an Assessment Lesson booked.",
};
