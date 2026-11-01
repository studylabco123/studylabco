import { formatPence } from "@/lib/format";
import type { Level, Settings } from "@/lib/types";
import { noticeDaysText } from "./prices";

// Plain-English explanations behind the "i" buttons on the public price lists
// and in the Q&A. Every number comes from settings. Never "fine", "penalty" or "waiver".

type S = Pick<
  Settings,
  | "travelFeePence"
  | "passValidityMonths"
  | "passMinNoticeDays"
  | "cancellationNoticeHours"
  | "lateFeePercent"
  | "allowedPostcodeDistricts"
  | "priceSundayBundlePence"
>;

const areas = (s: S) => {
  const d = s.allowedPostcodeDistricts;
  return d.length <= 1 ? (d[0] ?? "") : `${d.slice(0, -1).join(", ")} and ${d[d.length - 1]}`;
};

/** The owner's one-line explanation of a group pass (ruling), with the numbers from settings. */
export function passSummary(s: S): string {
  return `Buy 6 or 10 group sessions upfront at a discount, then book the dates you want — at least ${noticeDaysText(s.passMinNoticeDays)} ahead — within ${s.passValidityMonths} months. Miss one with ${s.cancellationNoticeHours} hours' notice and the session goes back on your pass.`;
}

/** The 14-day cooling-off right in plain words (ruling). The 14 days are set by law, not a setting. */
export function coolingOffSummary(s: Pick<Settings, "cancellationNoticeHours">): string {
  return `By law, you have 14 days after booking (or buying a pass) to change your mind. Cancel within those 14 days and it's free — even if the lesson is less than ${s.cancellationNoticeHours} hours away. For a pass, unused sessions become account credit.`;
}

export const priceInfo = {
  assessment(level: Level): string {
    return level === "KS3"
      ? "The first lesson for a new Year 7 or 8 student: 60 minutes, ending with a 15-minute talk with you about goals and next steps. Year 9 students take the GCSE Assessment Lesson instead."
      : "The first lesson for every new Year 9, 10 or 11 student: 60 minutes, ending with a 15-minute talk with you about goals and next steps. A parent or guardian must be there for the talk.";
  },
  oneToOne(level: Level): string {
    return level === "KS3"
      ? "A 60-minute lesson for your child on their own, at the KS3 price, planned around what they are learning at school."
      : "A 60-minute lesson for your child on their own, planned around their exam board, tier and target grade.";
  },
  homeVisit(s: S): string {
    return `The same lesson at your home, on Sundays only, for ${areas(s)} postcodes. The price includes a ${formatPence(s.travelFeePence)} travel fee. The tutor approves each home visit request first.`;
  },
  group(level: Level): string {
    return level === "KS3"
      ? "One 60-minute science session in a small group, for KS3 students only (Years 7–9). Book one session at a time, or use a KS3 group pass."
      : "One 60-minute GCSE science session in a small group for Years 10 and 11 (Year 9 students studying GCSE are welcome). Book one session at a time, or use a GCSE group pass.";
  },
  sundayBundle(s: S): string {
    return `Both Sunday GCSE group sessions on the same day, booked together for ${formatPence(s.priceSundayBundlePence)}. With a GCSE group pass, a Sunday bundle uses 2 sessions.`;
  },
  pass(level: Level, sessions: number, pricePence: number, s: S): string {
    return `${sessions} ${level} group sessions for ${formatPence(pricePence)}, for one child. ${passSummary(s)} Sessions unlock once we've received your bank transfer.`;
  },
};
