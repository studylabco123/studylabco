import { addDays } from "@/lib/time";

/** UK tax years run 6 April to 5 April. All dates are London calendar dates ('YYYY-MM-DD'). */
export interface TaxYear {
  label: string;
  start: string;
  end: string;
}

export interface TaxRange extends TaxYear {
  /** The quarter (1-4), or null for the whole year. */
  q: 1 | 2 | 3 | 4 | null;
}

const label = (startYear: number) => `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;

export function taxYearFor(date: string): TaxYear {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Invalid date: ${date}`);
  const y = Number(m[1]);
  const onOrAfterApril6 = m[2] > "04" || (m[2] === "04" && m[3] >= "06");
  const startYear = onOrAfterApril6 ? y : y - 1;
  return { label: label(startYear), start: `${startYear}-04-06`, end: `${startYear + 1}-04-05` };
}

function startYearOf(l: string): number | null {
  const m = /^(\d{4})-(\d{2})$/.exec(l);
  if (!m) return null;
  const y = Number(m[1]);
  return label(y) === l ? y : null;
}

export function quarterRanges(taxYearLabel: string): { q: 1 | 2 | 3 | 4; start: string; end: string }[] {
  const y = startYearOf(taxYearLabel);
  if (y === null) throw new Error(`Invalid tax year: ${taxYearLabel}`);
  return [
    { q: 1, start: `${y}-04-06`, end: `${y}-07-05` },
    { q: 2, start: `${y}-07-06`, end: `${y}-10-05` },
    { q: 3, start: `${y}-10-06`, end: `${y + 1}-01-05` },
    { q: 4, start: `${y + 1}-01-06`, end: `${y + 1}-04-05` },
  ];
}

/** A whole tax year or one of its quarters; null when the label or quarter is not valid. */
export function rangeFor(taxYearLabel: string, q?: number | null): TaxRange | null {
  const y = startYearOf(taxYearLabel);
  if (y === null) return null;
  if (q === undefined || q === null) return { label: taxYearLabel, start: `${y}-04-06`, end: `${y + 1}-04-05`, q: null };
  const found = quarterRanges(taxYearLabel).find((r) => r.q === q);
  return found ? { label: taxYearLabel, ...found } : null;
}

/** 45p a mile for the first 10,000 miles of a tax year, 25p after. Miles may have one decimal. */
export function mileageAllowancePence(totalMiles: number): number {
  const tenths = Math.round(Math.max(0, totalMiles) * 10);
  const first = Math.min(tenths, 100_000);
  const rest = tenths - first;
  return Math.round((first * 45 + rest * 25) / 10);
}

export interface DateSpan {
  start: string;
  end: string;
}

/** This week (Monday to Sunday), month and calendar year around a London date. */
export function londonPeriods(today: string): { week: DateSpan; month: DateSpan; year: DateSpan } {
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  const monday = addDays(today, -((dow + 6) % 7));
  const [y, m] = today.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return {
    week: { start: monday, end: addDays(monday, 6) },
    month: { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(lastDay).padStart(2, "0")}` },
    year: { start: `${y}-01-01`, end: `${y}-12-31` },
  };
}
