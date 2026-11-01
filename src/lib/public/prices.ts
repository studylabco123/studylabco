import type { Level, PassSessions, Settings } from "@/lib/types";

/** Every public price, in pence, straight from settings. Home visits add the travel fee. */
export function lessonPrices(s: Settings) {
  return {
    assessment: s.priceAssessmentPence,
    assessmentHome: s.priceAssessmentPence + s.travelFeePence,
    oneToOne: s.priceOneToOnePence,
    oneToOneHome: s.priceOneToOnePence + s.travelFeePence,
    group: s.priceGroupPence,
    sundayBundle: s.priceSundayBundlePence,
    travel: s.travelFeePence,
    ks3Assessment: s.priceKs3AssessmentPence,
    ks3AssessmentHome: s.priceKs3AssessmentPence + s.travelFeePence,
    ks3OneToOne: s.priceKs3OneToOnePence,
    ks3OneToOneHome: s.priceKs3OneToOnePence + s.travelFeePence,
    ks3Group: s.priceKs3GroupPence,
  };
}

/** Who a group is for, everywhere on the public site (spec v2 §4). */
export const GROUP_LEVEL_LABEL: Record<Level, string> = {
  KS3: "KS3 only (Years 7–9)",
  GCSE: "GCSE (Years 10–11; Year 9 GCSE students welcome)",
};

export const YEAR9_NOTE =
  "Year 9? Choose KS3 or GCSE when you add your child. Every Year 9 student books the GCSE Assessment Lesson.";

/** "a week" for 7 days, else "N days" (pass booking notice). */
export function noticeDaysText(days: number): string {
  return days === 7 ? "a week" : days === 1 ? "1 day" : `${days} days`;
}

export interface PassOffer {
  level: Level;
  sessions: PassSessions;
  pricePence: number;
  /** The same sessions booked one at a time at the level's group price. */
  singlePence: number;
  savingPence: number;
}

/** Group passes with their saving against booking sessions one by one (never negative). */
export function passOffers(s: Settings): PassOffer[] {
  const single: Record<Level, number> = { KS3: s.priceKs3GroupPence, GCSE: s.priceGroupPence };
  return (["KS3", "GCSE"] as const).flatMap((level) =>
    ([6, 10] as const).map((sessions) => {
      const pricePence = s.passPrices[level][String(sessions) as "6" | "10"];
      const singlePence = single[level] * sessions;
      return { level, sessions, pricePence, singlePence, savingPence: Math.max(0, singlePence - pricePence) };
    }),
  );
}

/** "08:15" -> "8:15am", "13:00" -> "1pm". */
export function twelveHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour}:${String(m).padStart(2, "0")}${suffix}` : `${hour}${suffix}`;
}

/** Start times of active weekly groups, per weekday (0 = Sunday), earliest first. */
export function groupTimesByDay(series: { weekday: number; startTime: string; active: boolean }[]): Record<number, string[]> {
  const out: Record<number, string[]> = {};
  for (const s of [...series].filter((x) => x.active).sort((a, b) => a.startTime.localeCompare(b.startTime))) {
    const t = twelveHour(s.startTime);
    const day = (out[s.weekday] ??= []);
    if (!day.includes(t)) day.push(t);
  }
  return out;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Which level each group day is for, from the active series: "Saturday: KS3 only (Years 7–9). Sunday: GCSE (...)."
 * Weekend days first (Saturday, then Sunday), then the weekdays.
 */
export function groupDaysByLevel(series: { weekday: number; active: boolean; level: Level }[]): string {
  const order = [6, 0, 1, 2, 3, 4, 5];
  return order
    .flatMap((day) => {
      const levels = (["KS3", "GCSE"] as const).filter((l) => series.some((x) => x.active && x.weekday === day && x.level === l));
      return levels.length ? [`${DAY_NAMES[day]}: ${levels.map((l) => GROUP_LEVEL_LABEL[l]).join(" and ")}.`] : [];
    })
    .join(" ");
}
