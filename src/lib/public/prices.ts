import type { BlockWeeks, GroupProduct, Settings } from "@/lib/types";

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

export interface BlockOffer {
  product: GroupProduct;
  weeks: BlockWeeks;
  pricePence: number;
  /** The same weeks booked one at a time. */
  weeklyPence: number;
  savingPence: number;
}

/** Group blocks with their saving against weekly booking (never negative). */
export function blockOffers(s: Settings): BlockOffer[] {
  const weekly: Record<GroupProduct, number> = { saturday: s.priceGroupPence, sunday_bundle: s.priceSundayBundlePence };
  return (["saturday", "sunday_bundle"] as const).flatMap((product) =>
    ([6, 10] as const).map((weeks) => {
      const pricePence = s.blockPrices[product][weeks];
      const weeklyPence = weekly[product] * weeks;
      return { product, weeks, pricePence, weeklyPence, savingPence: Math.max(0, weeklyPence - pricePence) };
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
