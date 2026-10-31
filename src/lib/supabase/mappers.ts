// Row mappers: snake_case database rows (ISO strings, as PostgREST returns them)
// to the camelCase types in src/lib/types.ts.
// Pattern for later tasks: declare a `XRow` interface with the columns, write
// `mapX(row: XRow): X` using `toDate`/`toDateOrNull` for timestamptz columns
// (date-only and time columns stay strings), and for tables that get written
// add `xPatchToRow` built on `patchToRow` with an explicit column map.
import type { BlockPrices, BlockWeeks, GroupProduct, PrivateSettings, Settings } from "@/lib/types";

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
  block_prices: Record<string, Record<string, number>>;
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
}

function mapBlockPrices(raw: SettingsRow["block_prices"]): BlockPrices {
  const product = (p: GroupProduct): Record<BlockWeeks, number> => ({
    6: raw[p]["6"],
    10: raw[p]["10"],
  });
  return { saturday: product("saturday"), sunday_bundle: product("sunday_bundle") };
}

export function mapSettings(row: SettingsRow): Settings {
  return {
    priceAssessmentPence: row.price_assessment_pence,
    priceOneToOnePence: row.price_one_to_one_pence,
    priceGroupPence: row.price_group_pence,
    priceSundayBundlePence: row.price_sunday_bundle_pence,
    travelFeePence: row.travel_fee_pence,
    blockPrices: mapBlockPrices(row.block_prices),
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
  };
}

const SETTINGS_COLUMNS: { [K in keyof Settings]: string } = {
  priceAssessmentPence: "price_assessment_pence",
  priceOneToOnePence: "price_one_to_one_pence",
  priceGroupPence: "price_group_pence",
  priceSundayBundlePence: "price_sunday_bundle_pence",
  travelFeePence: "travel_fee_pence",
  blockPrices: "block_prices",
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
