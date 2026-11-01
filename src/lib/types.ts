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

/** What a weekly group series is (group_series.product): the Saturday group or one of the Sunday-bundle pair. */
export type GroupProduct = "saturday" | "sunday_bundle";

/** Teaching level. KS3 = Years 7-9, GCSE = Years 9-11 (Year 9 is the parent's choice). */
export type Level = "KS3" | "GCSE";
export type PassSessions = 6 | 10;
/** settings.pass_prices: explicit pence per level and pass size. */
export type PassPrices = Record<Level, Record<"6" | "10", number>>;

/** 0 = Sunday ... 6 = Saturday (London local). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Settings {
  priceAssessmentPence: number;
  priceOneToOnePence: number;
  priceGroupPence: number;
  priceSundayBundlePence: number;
  travelFeePence: number;
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
  priceKs3AssessmentPence: number;
  priceKs3OneToOnePence: number;
  priceKs3GroupPence: number;
  /** Late cancellation / no-show fee as a percentage of the lesson price (excluding travel). */
  lateFeePercent: number;
  passPrices: PassPrices;
  passValidityMonths: number;
  passMinNoticeDays: number;
}

export interface Child {
  id: string;
  createdAt: Date;
  parentId: string;
  firstName: string;
  lastName: string;
  schoolYear: number;
  level: Level;
  /** Required when level is GCSE. */
  examBoard: string | null;
  tier: string | null;
  subjects: string[];
  targetGrade: string | null;
}

export type PassStatus = "awaiting_payment" | "active" | "expired" | "cancelled";

export interface Pass {
  id: string;
  createdAt: Date;
  parentId: string | null;
  childId: string | null;
  level: Level;
  sessionsTotal: PassSessions;
  pricePence: number;
  paymentReference: string;
  status: PassStatus;
  paidAt: Date | null;
  expiresAt: Date | null;
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
  level: Level;
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
  /** Legacy fixed-week block (removed in v2; the column stays, always null for new bookings). */
  blockBookingId: string | null;
  passId: string | null;
  /** Late fee owed for late_cancelled / no_show; null = use the legacy rule. */
  feePence: number | null;
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
  passId: string | null;
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
