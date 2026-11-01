import { formatLondon, formatPence } from "@/lib/format";
import type { LocationKind } from "@/lib/types";
import type { SessionOption, WizardType } from "../types";

// Plain labels and London-time formatting for the booking wizard (no JSX, so
// unit tests can import them).

export const TYPE_LABEL: Record<WizardType, string> = {
  assessment: "Assessment Lesson",
  one_to_one: "1-to-1 lesson",
  group: "Group session",
  sunday_bundle: "Sunday bundle",
  pass: "Group pass",
  pass_session: "Session with your group pass",
};

/** Only locations a parent can be offered; "online" is only ever shown when enabled. */
export const LOCATION_LABEL: Partial<Record<LocationKind, string>> = {
  tutor_place: "At the tutor's place",
  home_visit: "Home visit",
  online: "Online",
};

/** "Monday 2 November 2026, 17:00" in London time. */
export function londonWhen(iso: string | Date): string {
  return formatLondon(new Date(iso), "EEEE d MMMM yyyy, HH:mm");
}

export function londonDay(iso: string | Date): string {
  return formatLondon(new Date(iso), "EEEE d MMMM yyyy");
}

export function londonTime(iso: string | Date): string {
  return formatLondon(new Date(iso), "HH:mm");
}

/**
 * The price line for a single group session: each session carries its own
 * price, so this is "£12.50" when every open session costs the same, "from
 * £10" when they differ, or null when none has a free seat.
 */
export function groupPriceText(sessions: SessionOption[]): string | null {
  const prices = sessions.filter((s) => s.seatsLeft > 0).map((s) => s.pricePence);
  if (!prices.length) return null;
  const low = Math.min(...prices);
  return prices.every((p) => p === low) ? formatPence(low) : `from ${formatPence(low)}`;
}
