// Shared domain types mirroring supabase/migrations/0001_schema.sql.
// Field names are camelCase versions of the snake_case columns.
// Money is integer pence. Timestamps (timestamptz) are Date (UTC instants);
// dates are 'YYYY-MM-DD' strings and times 'HH:MM' or 'HH:MM:SS' strings,
// both in Europe/London local terms.

export type UserRole = "parent" | "admin";
export type LocationKind = "tutor_place" | "home_visit" | "online" | "group_venue";
export type BookingKind = "assessment" | "one_to_one" | "group";
export type BookingStatus =
  | "pending"
  | "confirmed"
  | "declined"
  | "cancelled"
  | "late_cancelled"
  | "no_show"
  | "attended";
export type PaymentStatus = "unpaid" | "paid" | "waived" | "credited" | "refunded";
export type PeriodKind = "term" | "holiday";
export type PaymentMethod = "bank_transfer" | "cash";
export type LedgerKind = "payment" | "refund" | "credit" | "waiver" | "credit_applied";

/** Group block products (group_series.product, block_bookings.product). */
export type GroupProduct = "saturday" | "sunday_bundle";
export type BlockWeeks = 6 | 10;
/** settings.block_prices: explicit pence per product and block length. */
export type BlockPrices = Record<GroupProduct, Record<BlockWeeks, number>>;

/** 0 = Sunday ... 6 = Saturday (London local). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Settings {
  priceAssessmentPence: number;
  priceOneToOnePence: number;
  priceGroupPence: number;
  priceSundayBundlePence: number;
  travelFeePence: number;
  blockPrices: BlockPrices;
  onlineEnabled: boolean;
  homeVisitsEnabled: boolean;
  tutorPlaceEnabled: boolean;
  cancellationNoticeHours: number;
  bookingWindowDays: number;
  minNoticeHours: number;
  defaultGroupCapacity: number;
  homeVisitBufferMinutes: number;
  allowedPostcodeDistricts: string[];
  flagThreshold: number;
  groupVenue: string | null;
  businessPhone: string | null;
  businessAddress: string | null;
  /** The person who runs Study Lab Co, shown in the footer and on Contact when set (R24). */
  ownerName: string | null;
}

export interface PrivateSettings {
  bankAccountName: string | null;
  bankSortCode: string | null;
  bankAccountNumber: string | null;
  teachingAddress: string | null;
  meetingLink: string | null;
  calendarFeedToken: string;
}

/** Slots start hourly from startTime; the last start is endTime - 60 min. */
export interface AvailabilityRule {
  id: string;
  period: PeriodKind;
  weekday: Weekday;
  startTime: string;
  endTime: string;
  kinds: BookingKind[];
  locations: LocationKind[];
}

/** Term-time segment, inclusive. Dates not covered by any term are holiday. */
export interface TermPeriod {
  id: string;
  label: string;
  startsOn: string;
  endsOn: string;
}

export interface BlockedTime {
  id: string;
  startsAt: Date;
  endsAt: Date;
  reason: string;
  isDefault: boolean;
}

/** Repeating weekly block, London local times, validTo inclusive or open. */
export interface BlockedRule {
  id: string;
  weekday: Weekday;
  startTime: string;
  endTime: string;
  validFrom: string;
  validTo: string | null;
  reason: string;
}

export interface GroupSession {
  id: string;
  seriesId: string | null;
  title: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  pricePence: number;
  venue: string | null;
  isOnline: boolean;
  status: "scheduled" | "cancelled";
}

export interface Booking {
  id: string;
  createdAt: Date;
  parentId: string | null;
  childId: string | null;
  kind: BookingKind;
  location: LocationKind;
  startsAt: Date;
  endsAt: Date;
  /** endsAt plus any travel buffer (home visits). */
  busyUntil: Date;
  groupSessionId: string | null;
  blockBookingId: string | null;
  bundleId: string | null;
  status: BookingStatus;
  pricePence: number;
  travelFeePence: number;
  paymentReference: string;
  paymentStatus: PaymentStatus;
  homeAddress: string | null;
  homePostcode: string | null;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  decidedAt: Date | null;
}

export interface LedgerEntry {
  id: string;
  createdAt: Date;
  bookingId: string | null;
  blockBookingId: string | null;
  parentId: string | null;
  kind: LedgerKind;
  method: PaymentMethod | null;
  amountPence: number;
  occurredOn: string;
  note: string;
}

export interface Expense {
  id: string;
  createdAt: Date;
  spentOn: string;
  category: string;
  description: string;
  amountPence: number;
  receiptPath: string | null;
}

export interface MileageEntry {
  id: string;
  createdAt: Date;
  bookingId: string | null;
  tripOn: string;
  miles: number | null;
  note: string;
}
