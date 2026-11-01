import type { BlockPrices, BlockWeeks, GroupProduct, Level, LocationKind, PassPrices } from "@/lib/types";

/** What the parent is booking. */
export type WizardType = "assessment" | "one_to_one" | "group" | "sunday_bundle" | "block";
export type LessonType = "assessment" | "one_to_one";

export interface ChildOption {
  id: string;
  name: string;
  level: Level;
  schoolYear: number;
  hasAgreement: boolean;
  approved: boolean;
  assessmentBooked: boolean;
}

/** A bookable group session (scheduled, within the booking window). Times are ISO strings. */
export interface SessionOption {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  seatsLeft: number;
  /** This session's own price (what a single-seat booking is charged). */
  pricePence: number;
  venue: string | null;
  product: GroupProduct | null;
}

/** The public settings the wizard needs (no secrets, no switched-off options). */
export interface WizardSettings {
  priceAssessmentPence: number;
  priceOneToOnePence: number;
  priceGroupPence: number;
  priceKs3AssessmentPence: number;
  priceKs3OneToOnePence: number;
  priceKs3GroupPence: number;
  lateFeePercent: number;
  passPrices: PassPrices;
  priceSundayBundlePence: number;
  travelFeePence: number;
  blockPrices: BlockPrices;
  cancellationNoticeHours: number;
  homeVisitBufferMinutes: number;
  allowedPostcodeDistricts: string[];
  groupVenue: string | null;
  /** Locations a parent may choose for 1-to-1 lessons, in display order. */
  lessonLocations: LocationKind[];
}

export interface WizardData {
  children: ChildOption[];
  settings: WizardSettings;
  /** A family-level reason no booking can be made (blocked account or unpaid balance). */
  familyMessage: string | null;
  sessions: SessionOption[];
}

export interface BlockChoice {
  product: GroupProduct;
  weeks: BlockWeeks;
  firstDate: string;
}

/** Everything chosen so far. */
export interface Selection {
  childId?: string;
  type?: WizardType;
  location?: LocationKind;
  homeAddress?: string;
  postcode?: string;
  /** ISO start of the chosen 1-to-1/assessment slot. */
  slot?: string;
  sessionId?: string;
  /** London date of the chosen Sunday bundle. */
  bundleDate?: string;
  block?: BlockChoice;
}

export type ConfirmPayload =
  | { type: LessonType; childId: string; location: LocationKind; startsAt: string; homeAddress?: string; postcode?: string; coolingOff: boolean }
  | { type: "group"; childId: string; sessionId: string; coolingOff: boolean }
  | { type: "sunday_bundle"; childId: string; date: string; coolingOff: boolean }
  | { type: "block"; childId: string; product: GroupProduct; weeks: BlockWeeks; firstDate: string; coolingOff: boolean };

/** A request before the cooling-off tick is added. */
export type DraftPayload = ConfirmPayload extends infer P ? (P extends unknown ? Omit<P, "coolingOff"> : never) : never;
