import { describe, expect, test } from "vitest";
import { mapPrivateSettings, mapSettings, settingsPatchToRow, toDate } from "@/lib/supabase/mappers";

const row = {
  id: 1,
  created_at: "2026-10-01T10:00:00+00:00",
  price_assessment_pence: 1000,
  price_one_to_one_pence: 2500,
  price_group_pence: 1800,
  price_sunday_bundle_pence: 3000,
  travel_fee_pence: 500,
  block_prices: { saturday: { "6": 10200, "10": 16200 }, sunday_bundle: { "6": 17100, "10": 27000 } },
  online_enabled: false,
  home_visits_enabled: true,
  tutor_place_enabled: true,
  cancellation_notice_hours: 48,
  booking_window_days: 28,
  min_notice_hours: 24,
  default_group_capacity: 15,
  home_visit_buffer_minutes: 30,
  allowed_postcode_districts: ["BB1", "BB2"],
  flag_threshold: 2,
  group_venue: null,
  business_phone: null,
  business_address: null,
};

describe("mapSettings", () => {
  test("maps snake_case columns to the Settings type", () => {
    const s = mapSettings(row);
    expect(s.priceAssessmentPence).toBe(1000);
    expect(s.priceSundayBundlePence).toBe(3000);
    expect(s.homeVisitBufferMinutes).toBe(30);
    expect(s.allowedPostcodeDistricts).toEqual(["BB1", "BB2"]);
    expect(s.onlineEnabled).toBe(false);
    expect(s.groupVenue).toBeNull();
  });

  test("block prices get numeric week keys", () => {
    const s = mapSettings(row);
    expect(s.blockPrices.saturday[6]).toBe(10200);
    expect(s.blockPrices.sunday_bundle[10]).toBe(27000);
  });

  test("does not leak row-only columns", () => {
    expect(mapSettings(row)).not.toHaveProperty("id");
    expect(mapSettings(row)).not.toHaveProperty("createdAt");
  });
});

describe("mapPrivateSettings", () => {
  test("maps bank and feed fields", () => {
    const p = mapPrivateSettings({
      bank_account_name: "Study Lab Co",
      bank_sort_code: "00-00-00",
      bank_account_number: "12345678",
      teaching_address: null,
      meeting_link: null,
      calendar_feed_token: "abc",
    });
    expect(p).toEqual({
      bankAccountName: "Study Lab Co",
      bankSortCode: "00-00-00",
      bankAccountNumber: "12345678",
      teachingAddress: null,
      meetingLink: null,
      calendarFeedToken: "abc",
    });
  });
});

describe("settingsPatchToRow", () => {
  test("converts only the keys given, to snake_case", () => {
    expect(settingsPatchToRow({ travelFeePence: 600, onlineEnabled: true })).toEqual({
      travel_fee_pence: 600,
      online_enabled: true,
    });
  });
});

describe("toDate", () => {
  test("parses ISO timestamps to Date", () => {
    expect(toDate("2026-11-07T08:15:00+00:00").toISOString()).toBe("2026-11-07T08:15:00.000Z");
  });
});
