import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { LONDON } from "@/lib/time";

/** 2500 -> "£25", 1250 -> "£12.50". */
export function formatPence(p: number): string {
  const sign = p < 0 ? "-" : "";
  const abs = Math.abs(p);
  const pounds = Math.floor(abs / 100);
  const pence = abs % 100;
  return `${sign}£${pounds}${pence === 0 ? "" : `.${String(pence).padStart(2, "0")}`}`;
}

/** date-fns format of an instant in Europe/London. */
export function formatLondon(instant: Date, pattern: string): string {
  return format(new TZDate(instant.getTime(), LONDON), pattern);
}
