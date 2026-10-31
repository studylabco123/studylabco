import type { BlockWeeks, GroupProduct, LocationKind, Settings } from "@/lib/types";

export type QuoteItem =
  | { type: "assessment" | "one_to_one"; location: LocationKind }
  | { type: "group" }
  | { type: "sunday_bundle" }
  | { type: "block"; product: GroupProduct; weeks: BlockWeeks };

export interface Quote {
  basePence: number;
  travelPence: number;
  totalPence: number;
  perBookingPence: number[];
}

/** Splits total evenly across n bookings; the remainder goes on the first. */
function split(total: number, n: number): number[] {
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
  | "priceSundayBundlePence"
  | "travelFeePence"
  | "blockPrices"
>;

export function quote(item: QuoteItem, s: PriceSettings): Quote {
  switch (item.type) {
    case "assessment":
    case "one_to_one": {
      const basePence = item.type === "assessment" ? s.priceAssessmentPence : s.priceOneToOnePence;
      const travelPence = item.location === "home_visit" ? s.travelFeePence : 0;
      const totalPence = basePence + travelPence;
      return { basePence, travelPence, totalPence, perBookingPence: [totalPence] };
    }
    case "group":
      return { basePence: s.priceGroupPence, travelPence: 0, totalPence: s.priceGroupPence, perBookingPence: [s.priceGroupPence] };
    case "sunday_bundle": {
      const t = s.priceSundayBundlePence;
      return { basePence: t, travelPence: 0, totalPence: t, perBookingPence: split(t, 2) };
    }
    case "block": {
      const t = s.blockPrices[item.product][item.weeks];
      const count = item.product === "sunday_bundle" ? item.weeks * 2 : item.weeks;
      return { basePence: t, travelPence: 0, totalPence: t, perBookingPence: split(t, count) };
    }
  }
}
