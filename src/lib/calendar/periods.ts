import type { PeriodKind, TermPeriod } from "@/lib/types";

/** 'term' if the date is inside any term segment (inclusive), else 'holiday'. */
export function periodFor(date: string, terms: TermPeriod[]): PeriodKind {
  return terms.some((t) => t.startsOn <= date && date <= t.endsOn) ? "term" : "holiday";
}
