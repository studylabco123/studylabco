import { formatPence } from "@/lib/format";
import { FALLBACK_EMAIL } from "@/lib/site";
import type { Level, LocationKind } from "@/lib/types";

// Short, plain-English explanations behind the "i" buttons. Safe for client code.
// Never "fine", "penalty" or "waiver".

export interface InfoSettings {
  lateFeePercent: number;
  cancellationNoticeHours: number;
  travelFeePence: number;
  allowedPostcodeDistricts: string[];
}

type InfoType = "assessment" | "one_to_one" | "group" | "sunday_bundle" | "block";

const districts = (s: InfoSettings) => {
  const d = s.allowedPostcodeDistricts;
  return d.length <= 1 ? (d[0] ?? "") : `${d.slice(0, -1).join(", ")} and ${d[d.length - 1]}`;
};

export function typeInfo(type: InfoType, level: Level, s: InfoSettings): string {
  switch (type) {
    case "assessment":
      return "Every new student starts with one Assessment Lesson: 60 minutes in person, ending with a 15-minute talk with you about goals. Once it has taken place and the tutor has approved your child, you can book 1-to-1 lessons and groups. Year 9 students always take the GCSE Assessment Lesson.";
    case "one_to_one":
      return level === "KS3"
        ? "A 60-minute lesson for your child on their own, at the KS3 price, planned around what they are learning at school."
        : "A 60-minute lesson for your child on their own, planned around their exam board, tier and target grade.";
    case "group":
      return level === "KS3"
        ? "One 60-minute science session in a small group for KS3 students (Years 7–9). You only see sessions for your child's level."
        : "One 60-minute GCSE science session in a small group for Years 10 and 11 (Year 9 students studying GCSE are welcome). You only see sessions for your child's level.";
    case "sunday_bundle":
      return "Both Sunday GCSE group sessions on the same day, booked together for one price. Each session counts as its own lesson if you need to cancel.";
    case "block":
      return `A run of 6 or 10 weekly group sessions booked in one go, for one price. Weeks with no session, such as holidays, are skipped. You can cancel each session for free up to ${s.cancellationNoticeHours} hours before it starts.`;
  }
}

export function locationInfo(location: LocationKind, s: InfoSettings): string {
  switch (location) {
    case "tutor_place":
      return "The lesson is at the tutor's place in Blackburn (BB1). To keep everyone safe, we only share the full address once your booking is confirmed.";
    case "home_visit":
      return `The tutor comes to your home, on Sundays only, in ${districts(s)} postcodes. A ${formatPence(s.travelFeePence)} travel fee is added. The tutor approves each home visit first and we email you either way. A parent or guardian should be at home during the lesson.`;
    case "online":
      return "A live video lesson using the meeting link we email you. Your child should join from a quiet, shared space at home, with a parent or guardian nearby.";
    default:
      return "";
  }
}

export const COOLING_OFF_INFO =
  "By law you have 14 days from booking to change your mind, and cancelling in that time is always free. Ticking the box lets lessons start within those 14 days. A lesson that has already taken place cannot be cancelled.";

export function lateFeeInfo(s: Pick<InfoSettings, "lateFeePercent" | "cancellationNoticeHours">): string {
  return `Cancelling with at least ${s.cancellationNoticeHours} hours to go is free. With less than ${s.cancellationNoticeHours} hours to go, a late cancellation fee of ${s.lateFeePercent}% of the lesson price applies (never the home-visit travel fee). Cancelling inside your 14-day cooling-off period is always free.`;
}

export const CREDIT_INFO = `Credit is money we hold for you, for example when a lesson you had already paid for is cancelled for free. The tutor takes it off a future lesson. If you would rather have it back, email ${FALLBACK_EMAIL} and we will refund it to your card.`;
