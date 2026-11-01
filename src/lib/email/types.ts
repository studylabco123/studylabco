import type { BookingStatus, LocationKind } from "@/lib/types";

/** One booking row as an email describes it. */
export interface SessionLine {
  reference: string;
  title: string;
  childName: string | null;
  startsAt: Date;
  endsAt: Date;
  location: LocationKind;
  status: BookingStatus;
  /** Lesson price in pence, excluding any travel fee. */
  pricePence: number;
  travelPence: number;
  /** Family address for a home visit. */
  homeAddress?: string | null;
  /** Venue for a group session. */
  venue?: string | null;
}

export interface BankDetails {
  accountName: string;
  sortCode: string;
  accountNumber: string;
}

export const DEFAULT_NOTICE_HOURS = 48;
