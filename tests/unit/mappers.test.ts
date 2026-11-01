import { describe, expect, test } from "vitest";
import {
  mapAvailabilityRule,
  mapBlockedRule,
  mapBlockedTime,
  mapBooking,
  mapGroupSession,
  mapPrivateSettings,
  mapSettings,
  mapTermPeriod,
  settingsPatchToRow,
  toDate,
} from "@/lib/supabase/mappers";

const row = {
  id: 1,
  created_at: "2026-10-01T10:00:00+00:00",
  price_assessment_pence: 1000,
  price_one_to_one_pence: 2500,
  price_group_pence: 1800,
  price_sunday_bundle_pence: 3000,
  travel_fee_pence: 500,
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
  owner_name: "Jane Smith",
  price_ks3_assessment_pence: 750,
  price_ks3_one_to_one_pence: 2000,
  price_ks3_group_pence: 1400,
  late_fee_percent: 50,
  pass_prices: { KS3: { "6": 7900, "10": 12600 }, GCSE: { "6": 10200, "10": 16200 } },
  pass_validity_months: 6,
  pass_min_notice_days: 7,
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
    expect(s.ownerName).toBe("Jane Smith");
  });

  test("a missing owner name maps to null (R24)", () => {
    expect(mapSettings({ ...row, owner_name: null }).ownerName).toBeNull();
    expect(settingsPatchToRow({ ownerName: "Jane" })).toEqual({ owner_name: "Jane" });
  });

  test("maps the v2 KS3, late-fee and pass fields", () => {
    const s = mapSettings(row);
    expect(s.priceKs3AssessmentPence).toBe(750);
    expect(s.priceKs3OneToOnePence).toBe(2000);
    expect(s.priceKs3GroupPence).toBe(1400);
    expect(s.lateFeePercent).toBe(50);
    expect(s.passPrices.KS3[6]).toBe(7900);
    expect(s.passPrices.KS3[10]).toBe(12600);
    expect(s.passPrices.GCSE[6]).toBe(10200);
    expect(s.passPrices.GCSE[10]).toBe(16200);
    expect(s.passValidityMonths).toBe(6);
    expect(s.passMinNoticeDays).toBe(7);
    expect(settingsPatchToRow({ lateFeePercent: 25, passValidityMonths: 3 })).toEqual({ late_fee_percent: 25, pass_validity_months: 3 });
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

describe("mapBooking", () => {
  const bookingRow = {
    id: "b1",
    created_at: "2026-11-01T10:00:00+00:00",
    parent_id: "p1",
    child_id: "c1",
    kind: "assessment" as const,
    location: "home_visit" as const,
    starts_at: "2026-11-08T10:30:00+00:00",
    ends_at: "2026-11-08T11:30:00+00:00",
    busy_until: "2026-11-08T12:00:00+00:00",
    group_session_id: null,
    block_booking_id: null,
    pass_id: null,
    fee_pence: null,
    bundle_id: null,
    status: "pending" as const,
    price_pence: 1000,
    travel_fee_pence: 500,
    payment_reference: "SLC-1001",
    payment_status: "unpaid" as const,
    home_address: "1 Road",
    home_postcode: "BB1 1AA",
    cancelled_at: null,
    cancelled_by: null,
    decided_at: "2026-11-02T09:00:00+00:00",
  };

  test("maps columns and timestamps", () => {
    const b = mapBooking(bookingRow);
    expect(b).toMatchObject({
      id: "b1",
      parentId: "p1",
      childId: "c1",
      kind: "assessment",
      location: "home_visit",
      status: "pending",
      pricePence: 1000,
      travelFeePence: 500,
      paymentReference: "SLC-1001",
      paymentStatus: "unpaid",
      homeAddress: "1 Road",
      homePostcode: "BB1 1AA",
      cancelledAt: null,
      groupSessionId: null,
    });
    expect(b.startsAt.toISOString()).toBe("2026-11-08T10:30:00.000Z");
    expect(b.busyUntil.toISOString()).toBe("2026-11-08T12:00:00.000Z");
    expect(b.decidedAt?.toISOString()).toBe("2026-11-02T09:00:00.000Z");
    expect(b.createdAt).toBeInstanceOf(Date);
  });
});

describe("calendar mappers", () => {
  test("mapGroupSession", () => {
    const g = mapGroupSession({
      id: "g1",
      series_id: "s1",
      level: "KS3" as const,
      title: "Saturday",
      starts_at: "2026-11-07T08:15:00+00:00",
      ends_at: "2026-11-07T09:15:00+00:00",
      capacity: 15,
      price_pence: 1800,
      venue: null,
      is_online: false,
      status: "scheduled",
    });
    expect(g).toMatchObject({ id: "g1", seriesId: "s1", level: "KS3", capacity: 15, pricePence: 1800, isOnline: false, status: "scheduled" });
    expect(g.startsAt.toISOString()).toBe("2026-11-07T08:15:00.000Z");
    expect(g.endsAt.toISOString()).toBe("2026-11-07T09:15:00.000Z");
  });

  test("mapAvailabilityRule keeps London times as strings", () => {
    expect(
      mapAvailabilityRule({
        id: "r1",
        period: "term",
        weekday: 0,
        start_time: "10:30:00",
        end_time: "17:30:00",
        kinds: ["assessment", "one_to_one"],
        locations: ["tutor_place", "home_visit"],
      }),
    ).toEqual({
      id: "r1",
      period: "term",
      weekday: 0,
      startTime: "10:30:00",
      endTime: "17:30:00",
      kinds: ["assessment", "one_to_one"],
      locations: ["tutor_place", "home_visit"],
    });
  });

  test("mapTermPeriod", () => {
    expect(mapTermPeriod({ id: "t1", label: "Autumn 2", starts_on: "2026-11-02", ends_on: "2026-12-18" })).toEqual({
      id: "t1",
      label: "Autumn 2",
      startsOn: "2026-11-02",
      endsOn: "2026-12-18",
    });
  });

  test("mapBlockedTime and mapBlockedRule", () => {
    const t = mapBlockedTime({
      id: "x",
      starts_at: "2026-12-25T00:00:00+00:00",
      ends_at: "2026-12-26T00:00:00+00:00",
      reason: "Christmas Day",
      is_default: true,
    });
    expect(t.startsAt.toISOString()).toBe("2026-12-25T00:00:00.000Z");
    expect(t).toMatchObject({ id: "x", reason: "Christmas Day", isDefault: true });
    expect(
      mapBlockedRule({
        id: "y",
        weekday: 3,
        start_time: "17:00:00",
        end_time: "18:00:00",
        valid_from: "2026-11-01",
        valid_to: null,
        reason: "Club",
      }),
    ).toEqual({ id: "y", weekday: 3, startTime: "17:00:00", endTime: "18:00:00", validFrom: "2026-11-01", validTo: null, reason: "Club" });
  });
});

describe("settings rows missing price keys (Ruling R4)", () => {
  test("pass prices fall back to the seed defaults", () => {
    const s = mapSettings({ ...row, pass_prices: {} } as never);
    expect(s.passPrices).toEqual({ KS3: { 6: 7900, 10: 12600 }, GCSE: { 6: 10200, 10: 16200 } });
  });

  test("the unused block_prices column is not mapped", () => {
    expect(mapSettings({ ...row, block_prices: {} } as never)).not.toHaveProperty("blockPrices");
  });
  test("a partial row keeps what it has and defaults the rest", () => {
    const s = mapSettings({ ...row, pass_prices: { KS3: { "6": 8000 } } } as never);
    expect(s.passPrices.KS3[6]).toBe(8000);
    expect(s.passPrices.KS3[10]).toBe(12600);
    expect(s.passPrices.GCSE[6]).toBe(10200);
  });
});
