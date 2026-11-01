import type { GroupProduct, Level, LocationKind, PassPrices, PassSessions, PassStatus } from "@/lib/types";

/** What the parent is booking: a lesson or session, buying a group pass, or a session with a pass. */
export type WizardType = "assessment" | "one_to_one" | "group" | "sunday_bundle" | "pass" | "pass_session";
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
  /** KS3 or GCSE: a child only sees sessions at their own level. */
  level: Level;
  /** Far enough ahead to book with a group pass (at least passMinNoticeDays). */
  passBookable: boolean;
}

/** One of the family's group passes as the wizard shows it. */
export interface WizardPass {
  id: string;
  childId: string;
  level: Level;
  sessionsTotal: PassSessions;
  /** What the pass cost (its sessions share it). */
  pricePence: number;
  status: PassStatus;
  remaining: number;
  reference: string;
  /** "KS3 group pass — 4 of 6 sessions left — expires 1 May 2027". */
  text: string;
  /** Paid, not expired, with a session left. */
  bookable: boolean;
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
  cancellationNoticeHours: number;
  passValidityMonths: number;
  passMinNoticeDays: number;
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
  /** The family's group passes that are awaiting payment or usable. */
  passes: WizardPass[];
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
  /** London date of the chosen Sunday bundle (also with a pass). */
  bundleDate?: string;
  /** Buying a pass: how many sessions. */
  passSessions?: PassSessions;
  /** Booking with a pass: which one. */
  passId?: string;
}

export type ConfirmPayload =
  | { type: LessonType; childId: string; location: LocationKind; startsAt: string; homeAddress?: string; postcode?: string; coolingOff: boolean }
  | { type: "group"; childId: string; sessionId: string; coolingOff: boolean }
  | { type: "sunday_bundle"; childId: string; date: string; coolingOff: boolean };

/** A request before the cooling-off tick is added. */
export type DraftPayload = ConfirmPayload extends infer P ? (P extends unknown ? Omit<P, "coolingOff"> : never) : never;
