import type { Level, LocationKind, Settings } from "@/lib/types";

export type QuoteItem =
  | { type: "assessment" | "one_to_one"; level: Level; location: LocationKind }
  | { type: "group"; level: Level }
  | { type: "pass"; level: Level; sessions: 6 | 10 }
  | { type: "sunday_bundle" };

export interface Quote {
  basePence: number;
  travelPence: number;
  totalPence: number;
  perBookingPence: number[];
}

/** Splits total evenly across n bookings; the remainder goes on the first. */
export function split(total: number, n: number): number[] {
  const each = Math.floor(total / n);
  const parts = Array<number>(n).fill(each);
  parts[0] += total - each * n;
  return parts;
}

/** The settings a quote reads (a full Settings object also fits). */
export type PriceSettings = Pick<
  Settings,
  | "priceAssessmentPence"
  | "priceOneToOnePence"
  | "priceGroupPence"
  | "priceKs3AssessmentPence"
  | "priceKs3OneToOnePence"
  | "priceKs3GroupPence"
  | "passPrices"
  | "priceSundayBundlePence"
  | "travelFeePence"
>;

export function quote(item: QuoteItem, s: PriceSettings): Quote {
  switch (item.type) {
    case "assessment":
    case "one_to_one": {
      const ks3 = item.level === "KS3";
      const basePence =
        item.type === "assessment"
          ? ks3 ? s.priceKs3AssessmentPence : s.priceAssessmentPence
          : ks3 ? s.priceKs3OneToOnePence : s.priceOneToOnePence;
      const travelPence = item.location === "home_visit" ? s.travelFeePence : 0;
      const totalPence = basePence + travelPence;
      return { basePence, travelPence, totalPence, perBookingPence: [totalPence] };
    }
    case "group": {
      const p = item.level === "KS3" ? s.priceKs3GroupPence : s.priceGroupPence;
      return { basePence: p, travelPence: 0, totalPence: p, perBookingPence: [p] };
    }
    case "pass": {
      const t = s.passPrices[item.level][String(item.sessions) as "6" | "10"];
      return { basePence: t, travelPence: 0, totalPence: t, perBookingPence: split(t, item.sessions) };
    }
    case "sunday_bundle": {
      const t = s.priceSundayBundlePence;
      return { basePence: t, travelPence: 0, totalPence: t, perBookingPence: split(t, 2) };
    }
  }
}
