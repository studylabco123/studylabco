// Row mappers: snake_case database rows (ISO strings, as PostgREST returns them)
// to the camelCase types in src/lib/types.ts.
// Pattern for later tasks: declare a `XRow` interface with the columns, write
// `mapX(row: XRow): X` using `toDate`/`toDateOrNull` for timestamptz columns
// (date-only and time columns stay strings), and for tables that get written
// add `xPatchToRow` built on `patchToRow` with an explicit column map.
import type {
  AvailabilityRule,
  BlockedRule,
  BlockedTime,
  Booking,
  BookingKind,
  BookingStatus,
  Expense,
  GroupSession,
  Level,
  Pass,
  PassPrices,
  PassSessions,
  PassStatus,
  Child,
  LedgerEntry,
  LocationKind,
  MileageEntry,
  PaymentStatus,
  PeriodKind,
  PrivateSettings,
  Settings,
  TermPeriod,
  Weekday,
} from "@/lib/types";

/** timestamptz (ISO string) to Date. */
export function toDate(value: string): Date {
  return new Date(value);
}

export function toDateOrNull(value: string | null): Date | null {
  return value === null ? null : new Date(value);
}

/** Converts a camelCase patch to a snake_case row using an explicit column map. */
export function patchToRow<T extends object>(
  patch: Partial<T>,
  columns: { [K in keyof T]: string },
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(patch) as (keyof T)[]) {
    if (patch[key] === undefined) continue;
    out[columns[key]] = patch[key];
  }
  return out;
}

export interface SettingsRow {
  price_assessment_pence: number;
  price_one_to_one_pence: number;
  price_group_pence: number;
  price_sunday_bundle_pence: number;
  travel_fee_pence: number;
  online_enabled: boolean;
  home_visits_enabled: boolean;
  tutor_place_enabled: boolean;
  cancellation_notice_hours: number;
  booking_window_days: number;
  min_notice_hours: number;
  default_group_capacity: number;
  home_visit_buffer_minutes: number;
  allowed_postcode_districts: string[];
  flag_threshold: number;
  group_venue: string | null;
  business_phone: string | null;
  business_address: string | null;
  /** Added in 0007; null until the owner sets it. */
  owner_name?: string | null;
  /** Added in 0011. */
  price_ks3_assessment_pence: number;
  price_ks3_one_to_one_pence: number;
  price_ks3_group_pence: number;
  late_fee_percent: number;
  pass_prices: Record<string, Record<string, number>>;
  pass_validity_months: number;
  pass_min_notice_days: number;
}

/** Seed defaults (pence), used when a settings row predates a key (Ruling R4). */
const DEFAULT_PASS_PRICES: PassPrices = { KS3: { 6: 7900, 10: 12600 }, GCSE: { 6: 10200, 10: 16200 } };

const priceOr = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

function mapPassPrices(raw: SettingsRow["pass_prices"] | null | undefined): PassPrices {
  const level = (l: Level) => ({
    6: priceOr(raw?.[l]?.["6"], DEFAULT_PASS_PRICES[l][6]),
    10: priceOr(raw?.[l]?.["10"], DEFAULT_PASS_PRICES[l][10]),
  });
  return { KS3: level("KS3"), GCSE: level("GCSE") };
}

export function mapSettings(row: SettingsRow): Settings {
  return {
    priceAssessmentPence: row.price_assessment_pence,
    priceOneToOnePence: row.price_one_to_one_pence,
    priceGroupPence: row.price_group_pence,
    priceSundayBundlePence: row.price_sunday_bundle_pence,
    travelFeePence: row.travel_fee_pence,
    onlineEnabled: row.online_enabled,
    homeVisitsEnabled: row.home_visits_enabled,
    tutorPlaceEnabled: row.tutor_place_enabled,
    cancellationNoticeHours: row.cancellation_notice_hours,
    bookingWindowDays: row.booking_window_days,
    minNoticeHours: row.min_notice_hours,
    defaultGroupCapacity: row.default_group_capacity,
    homeVisitBufferMinutes: row.home_visit_buffer_minutes,
    allowedPostcodeDistricts: row.allowed_postcode_districts,
    flagThreshold: row.flag_threshold,
    groupVenue: row.group_venue,
    businessPhone: row.business_phone,
    businessAddress: row.business_address,
    ownerName: row.owner_name ?? null,
    priceKs3AssessmentPence: row.price_ks3_assessment_pence,
    priceKs3OneToOnePence: row.price_ks3_one_to_one_pence,
    priceKs3GroupPence: row.price_ks3_group_pence,
    lateFeePercent: row.late_fee_percent,
    passPrices: mapPassPrices(row.pass_prices),
    passValidityMonths: row.pass_validity_months,
    passMinNoticeDays: row.pass_min_notice_days,
  };
}

const SETTINGS_COLUMNS: { [K in keyof Settings]: string } = {
  priceAssessmentPence: "price_assessment_pence",
  priceOneToOnePence: "price_one_to_one_pence",
  priceGroupPence: "price_group_pence",
  priceSundayBundlePence: "price_sunday_bundle_pence",
  travelFeePence: "travel_fee_pence",
  onlineEnabled: "online_enabled",
  homeVisitsEnabled: "home_visits_enabled",
  tutorPlaceEnabled: "tutor_place_enabled",
  cancellationNoticeHours: "cancellation_notice_hours",
  bookingWindowDays: "booking_window_days",
  minNoticeHours: "min_notice_hours",
  defaultGroupCapacity: "default_group_capacity",
  homeVisitBufferMinutes: "home_visit_buffer_minutes",
  allowedPostcodeDistricts: "allowed_postcode_districts",
  flagThreshold: "flag_threshold",
  groupVenue: "group_venue",
  businessPhone: "business_phone",
  businessAddress: "business_address",
  ownerName: "owner_name",
  priceKs3AssessmentPence: "price_ks3_assessment_pence",
  priceKs3OneToOnePence: "price_ks3_one_to_one_pence",
  priceKs3GroupPence: "price_ks3_group_pence",
  lateFeePercent: "late_fee_percent",
  passPrices: "pass_prices",
  passValidityMonths: "pass_validity_months",
  passMinNoticeDays: "pass_min_notice_days",
};

export function settingsPatchToRow(patch: Partial<Settings>): Record<string, unknown> {
  return patchToRow(patch, SETTINGS_COLUMNS);
}

export interface PrivateSettingsRow {
  bank_account_name: string | null;
  bank_sort_code: string | null;
  bank_account_number: string | null;
  teaching_address: string | null;
  meeting_link: string | null;
  calendar_feed_token: string;
}

export function mapPrivateSettings(row: PrivateSettingsRow): PrivateSettings {
  return {
    bankAccountName: row.bank_account_name,
    bankSortCode: row.bank_sort_code,
    bankAccountNumber: row.bank_account_number,
    teachingAddress: row.teaching_address,
    meetingLink: row.meeting_link,
    calendarFeedToken: row.calendar_feed_token,
  };
}

const PRIVATE_SETTINGS_COLUMNS: { [K in keyof PrivateSettings]: string } = {
  bankAccountName: "bank_account_name",
  bankSortCode: "bank_sort_code",
  bankAccountNumber: "bank_account_number",
  teachingAddress: "teaching_address",
  meetingLink: "meeting_link",
  calendarFeedToken: "calendar_feed_token",
};

export function privateSettingsPatchToRow(patch: Partial<PrivateSettings>): Record<string, unknown> {
  return patchToRow(patch, PRIVATE_SETTINGS_COLUMNS);
}

export interface BookingRow {
  id: string;
  created_at: string;
  parent_id: string | null;
  child_id: string | null;
  kind: BookingKind;
  location: LocationKind;
  starts_at: string;
  ends_at: string;
  busy_until: string;
  group_session_id: string | null;
  block_booking_id: string | null;
  pass_id: string | null;
  fee_pence: number | null;
  bundle_id: string | null;
  status: BookingStatus;
  price_pence: number;
  travel_fee_pence: number;
  payment_reference: string;
  payment_status: PaymentStatus;
  home_address: string | null;
  home_postcode: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  decided_at: string | null;
}

export function mapBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    createdAt: toDate(row.created_at),
    parentId: row.parent_id,
    childId: row.child_id,
    kind: row.kind,
    location: row.location,
    startsAt: toDate(row.starts_at),
    endsAt: toDate(row.ends_at),
    busyUntil: toDate(row.busy_until),
    groupSessionId: row.group_session_id,
    blockBookingId: row.block_booking_id,
    passId: row.pass_id,
    feePence: row.fee_pence,
    bundleId: row.bundle_id,
    status: row.status,
    pricePence: row.price_pence,
    travelFeePence: row.travel_fee_pence,
    paymentReference: row.payment_reference,
    paymentStatus: row.payment_status,
    homeAddress: row.home_address,
    homePostcode: row.home_postcode,
    cancelledAt: toDateOrNull(row.cancelled_at),
    cancelledBy: row.cancelled_by,
    decidedAt: toDateOrNull(row.decided_at),
  };
}

export interface GroupSessionRow {
  id: string;
  series_id: string | null;
  level: Level;
  title: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  price_pence: number;
  venue: string | null;
  is_online: boolean;
  status: "scheduled" | "cancelled";
}

export function mapGroupSession(row: GroupSessionRow): GroupSession {
  return {
    id: row.id,
    seriesId: row.series_id,
    level: row.level,
    title: row.title,
    startsAt: toDate(row.starts_at),
    endsAt: toDate(row.ends_at),
    capacity: row.capacity,
    pricePence: row.price_pence,
    venue: row.venue,
    isOnline: row.is_online,
    status: row.status,
  };
}

export interface AvailabilityRuleRow {
  id: string;
  period: PeriodKind;
  weekday: number;
  start_time: string;
  end_time: string;
  kinds: BookingKind[];
  locations: LocationKind[];
}

export function mapAvailabilityRule(row: AvailabilityRuleRow): AvailabilityRule {
  return {
    id: row.id,
    period: row.period,
    weekday: row.weekday as Weekday,
    startTime: row.start_time,
    endTime: row.end_time,
    kinds: row.kinds,
    locations: row.locations,
  };
}

export interface TermPeriodRow {
  id: string;
  label: string;
  starts_on: string;
  ends_on: string;
}

export function mapTermPeriod(row: TermPeriodRow): TermPeriod {
  return { id: row.id, label: row.label, startsOn: row.starts_on, endsOn: row.ends_on };
}

export interface BlockedTimeRow {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string;
  is_default: boolean;
}

export function mapBlockedTime(row: BlockedTimeRow): BlockedTime {
  return {
    id: row.id,
    startsAt: toDate(row.starts_at),
    endsAt: toDate(row.ends_at),
    reason: row.reason,
    isDefault: row.is_default,
  };
}

export interface BlockedRuleRow {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  valid_from: string;
  valid_to: string | null;
  reason: string;
}

export function mapBlockedRule(row: BlockedRuleRow): BlockedRule {
  return {
    id: row.id,
    weekday: row.weekday as Weekday,
    startTime: row.start_time,
    endTime: row.end_time,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    reason: row.reason,
  };
}

export interface LedgerRow {
  id: string;
  created_at: string;
  booking_id: string | null;
  block_booking_id: string | null;
  pass_id: string | null;
  parent_id: string | null;
  kind: LedgerEntry["kind"];
  method: LedgerEntry["method"];
  amount_pence: number;
  occurred_on: string;
  note: string;
}

export function mapLedger(row: LedgerRow): LedgerEntry {
  return {
    id: row.id,
    createdAt: toDate(row.created_at),
    bookingId: row.booking_id,
    blockBookingId: row.block_booking_id,
    passId: row.pass_id,
    parentId: row.parent_id,
    kind: row.kind,
    method: row.method,
    amountPence: row.amount_pence,
    occurredOn: row.occurred_on,
    note: row.note,
  };
}

export interface ExpenseRowDb {
  id: string;
  created_at: string;
  spent_on: string;
  category: string;
  description: string;
  amount_pence: number;
  receipt_path: string | null;
}

export function mapExpense(row: ExpenseRowDb): Expense {
  return {
    id: row.id,
    createdAt: toDate(row.created_at),
    spentOn: row.spent_on,
    category: row.category,
    description: row.description,
    amountPence: row.amount_pence,
    receiptPath: row.receipt_path,
  };
}

export interface MileageRowDb {
  id: string;
  created_at: string;
  booking_id: string | null;
  trip_on: string;
  /** numeric(6,1): PostgREST returns a JSON number. */
  miles: number | string | null;
  note: string;
}

export function mapMileage(row: MileageRowDb): MileageEntry {
  return {
    id: row.id,
    createdAt: toDate(row.created_at),
    bookingId: row.booking_id,
    tripOn: row.trip_on,
    miles: row.miles === null ? null : Number(row.miles),
    note: row.note,
  };
}

export interface ChildRow {
  id: string;
  created_at: string;
  parent_id: string;
  first_name: string;
  last_name: string;
  school_year: number;
  level: Level;
  exam_board: string | null;
  tier: string | null;
  subjects: string[];
  target_grade: string | null;
}

export function mapChild(row: ChildRow): Child {
  return {
    id: row.id,
    createdAt: toDate(row.created_at),
    parentId: row.parent_id,
    firstName: row.first_name,
    lastName: row.last_name,
    schoolYear: row.school_year,
    level: row.level,
    examBoard: row.exam_board,
    tier: row.tier,
    subjects: row.subjects,
    targetGrade: row.target_grade,
  };
}

export interface PassRow {
  id: string;
  created_at: string;
  parent_id: string | null;
  child_id: string | null;
  level: Level;
  sessions_total: PassSessions;
  price_pence: number;
  payment_reference: string;
  status: PassStatus;
  paid_at: string | null;
  expires_at: string | null;
}

export function mapPass(row: PassRow): Pass {
  return {
    id: row.id,
    createdAt: toDate(row.created_at),
    parentId: row.parent_id,
    childId: row.child_id,
    level: row.level,
    sessionsTotal: row.sessions_total,
    pricePence: row.price_pence,
    paymentReference: row.payment_reference,
    status: row.status,
    paidAt: toDateOrNull(row.paid_at),
    expiresAt: toDateOrNull(row.expires_at),
  };
}
