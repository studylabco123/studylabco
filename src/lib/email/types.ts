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
  /** The late cancellation fee for this lesson (a share of the price, never travel). */
  lateFeePence: number;
  /** The late fee percentage (Settings), shown next to the amount. Defaults to 50. */
  lateFeePercent?: number;
  travelPence: number;
  /** Family address for a home visit. */
  homeAddress?: string | null;
  /** When the booking was made (for the 14-day cooling-off). Unknown: notice rule only. */
  bookedAt?: Date;
  /** Venue for a group session. */
  venue?: string | null;
  /** Booked with a group pass: nothing to pay, and a cancelled session goes back on the pass. */
  fromPass?: boolean;
}

export interface BankDetails {
  accountName: string;
  sortCode: string;
  accountNumber: string;
}

export const DEFAULT_NOTICE_HOURS = 48;
