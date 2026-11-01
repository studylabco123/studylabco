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
  };
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
