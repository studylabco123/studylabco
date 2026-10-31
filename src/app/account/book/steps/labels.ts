import { formatLondon } from "@/lib/format";
import type { LocationKind } from "@/lib/types";
import type { WizardType } from "../types";

// Plain labels and London-time formatting for the booking wizard (no JSX, so
// unit tests can import them).

export const TYPE_LABEL: Record<WizardType, string> = {
  assessment: "Assessment Lesson",
  one_to_one: "1-to-1 lesson",
  group: "Group session",
  sunday_bundle: "Sunday bundle",
  block: "Group block",
};

/** Only locations a parent can be offered; "online" is only ever shown when enabled. */
export const LOCATION_LABEL: Partial<Record<LocationKind, string>> = {
  tutor_place: "At the tutor's place",
  home_visit: "Home visit",
  online: "Online",
};

export const PRODUCT_LABEL = { saturday: "Saturday group", sunday_bundle: "Sunday bundle" } as const;

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
