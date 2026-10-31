import type {
  AvailabilityRule,
  BlockedRule,
  BlockedTime,
  BookingKind,
  LocationKind,
  PeriodKind,
  Settings,
  TermPeriod,
  Weekday,
} from "@/lib/types";

export const SETTINGS: Settings = {
  priceAssessmentPence: 1000,
  priceOneToOnePence: 2500,
  priceGroupPence: 1800,
  priceSundayBundlePence: 3000,
  travelFeePence: 500,
  blockPrices: {
    saturday: { 6: 10200, 10: 16200 },
    sunday_bundle: { 6: 17100, 10: 27000 },
  },
  onlineEnabled: false,
  homeVisitsEnabled: true,
  tutorPlaceEnabled: true,
  cancellationNoticeHours: 48,
  bookingWindowDays: 28,
  minNoticeHours: 24,
  defaultGroupCapacity: 15,
  homeVisitBufferMinutes: 30,
  allowedPostcodeDistricts: ["BB1", "BB2"],
  flagThreshold: 2,
  groupVenue: null,
  businessPhone: null,
  businessAddress: null,
};

const KINDS: BookingKind[] = ["assessment", "one_to_one"];

function rule(
  period: PeriodKind,
  weekday: Weekday,
  startTime: string,
  endTime: string,
  locations: LocationKind[],
): AvailabilityRule {
  return {
    id: `${period}-${weekday}`,
    period,
    weekday,
    startTime,
    endTime,
    kinds: KINDS,
    locations,
  };
}

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];

export const RULES: AvailabilityRule[] = [
  ...WEEKDAYS.map((d) => rule("term", d, "17:00:00", "20:00:00", ["tutor_place", "online"])),
  ...WEEKDAYS.map((d) => rule("holiday", d, "07:00:00", "22:00:00", ["tutor_place", "online"])),
  rule("term", 0, "10:30:00", "17:30:00", ["tutor_place", "home_visit", "online"]),
  rule("holiday", 0, "10:30:00", "17:30:00", ["tutor_place", "home_visit", "online"]),
];

const T = (label: string, startsOn: string, endsOn: string): TermPeriod => ({
  id: label,
  label,
  startsOn,
  endsOn,
});

export const TERMS: TermPeriod[] = [
  T("Autumn 1", "2026-09-01", "2026-10-23"),
  T("Autumn 2", "2026-11-02", "2026-12-18"),
  T("Spring 1", "2027-01-04", "2027-02-12"),
  T("Spring 2a", "2027-02-22", "2027-03-08"),
  T("Spring 2b", "2027-03-11", "2027-03-25"),
  T("Summer 1a", "2027-04-12", "2027-05-02"),
  T("Summer 1b", "2027-05-04", "2027-05-16"),
  T("Summer 1c", "2027-05-19", "2027-05-28"),
  T("Summer 2", "2027-06-07", "2027-07-22"),
];

export const CHRISTMAS: BlockedTime = {
  id: "xmas",
  startsAt: new Date("2026-12-25T00:00:00Z"),
  endsAt: new Date("2026-12-26T00:00:00Z"),
  reason: "Christmas Day",
  isDefault: true,
};

export const WEDNESDAY_RULE: BlockedRule = {
  id: "wed",
  weekday: 3,
  startTime: "17:00",
  endTime: "18:00",
  validFrom: "2026-01-01",
  validTo: null,
  reason: "Club",
};
