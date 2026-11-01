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
  /** Group passes: how long one lasts once paid, and how far ahead its sessions are booked. */
  passValidityMonths: number;
  passMinNoticeDays: number;
}

type InfoType = "assessment" | "one_to_one" | "group" | "sunday_bundle" | "pass" | "pass_session";

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
    case "pass":
      return passInfo(level, s);
    case "pass_session":
      return passSessionInfo(level, s);
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
  "By law you have 14 days from booking (or from buying a group pass) to change your mind, and cancelling in that time is always free. Ticking the box lets lessons start within those 14 days. A lesson that has already taken place cannot be cancelled. If you change your mind about a group pass within 14 days of buying it, unused sessions go back as account credit.";

/** What a group pass is, in plain words (wizard and dashboard). */
export function passInfo(level: Level, s: Pick<InfoSettings, "passValidityMonths" | "passMinNoticeDays">): string {
  const days = s.passMinNoticeDays === 7 ? "a week" : `${s.passMinNoticeDays} days`;
  return `A group pass is 6 or 10 ${level} group sessions for your child, paid up front for a lower price. You pay by bank transfer, and you can book sessions once we've received the payment. The pass then lasts ${s.passValidityMonths} months; book each session from your account at least ${days} before it, whenever suits you.${level === "GCSE" ? " A Sunday bundle (both Sunday sessions) uses 2." : ""} If you change your mind within 14 days of buying, unused sessions go back as credit. After that, unused sessions can't be refunded.`;
}

/** Booking with a pass, and what happens if your child misses a session. */
export function passSessionInfo(level: Level, s: Pick<InfoSettings, "cancellationNoticeHours" | "lateFeePercent" | "passMinNoticeDays">): string {
  const days = s.passMinNoticeDays === 7 ? "a week" : `${s.passMinNoticeDays} days`;
  return `Book any ${level} group session with a free seat at least ${days} ahead; it uses one session of your pass${level === "GCSE" ? " (a Sunday bundle uses 2)" : ""}. Cancel at least ${s.cancellationNoticeHours} hours before and the session goes back on your pass. Later than that, or if your child misses it, the session still goes back on your pass but a late cancellation fee of ${s.lateFeePercent}% of one session's value applies.`;
}

export function lateFeeInfo(s: Pick<InfoSettings, "lateFeePercent" | "cancellationNoticeHours">): string {
  return `Cancelling with at least ${s.cancellationNoticeHours} hours to go is free. With less than ${s.cancellationNoticeHours} hours to go, a late cancellation fee of ${s.lateFeePercent}% of the lesson price applies (never the home-visit travel fee). Cancelling inside your 14-day cooling-off period is always free.`;
}

export const CREDIT_INFO = `Credit is money we hold for you, for example when a lesson you had already paid for is cancelled for free, or when you cancel a group pass within 14 days of buying it (its unused sessions become credit). The tutor takes it off a future lesson. If you would rather have it back, email ${FALLBACK_EMAIL} and we will refund it to your bank account.`;
