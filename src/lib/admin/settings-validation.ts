import type { PrivateSettings, Settings } from "@/lib/types";

/** What the admin settings form posts: text and ticks exactly as typed. Money is in pounds. */
export interface SettingsFormInput {
  priceAssessment: string;
  priceOneToOne: string;
  priceGroup: string;
  priceSundayBundle: string;
  travelFee: string;
  tutorPlaceEnabled: boolean;
  homeVisitsEnabled: boolean;
  onlineEnabled: boolean;
  cancellationNoticeHours: string;
  bookingWindowDays: string;
  minNoticeHours: string;
  defaultGroupCapacity: string;
  homeVisitBufferMinutes: string;
  flagThreshold: string;
  allowedPostcodeDistricts: string;
  groupVenue: string;
  businessPhone: string;
  businessAddress: string;
  ownerName: string;
  priceKs3Assessment: string;
  priceKs3OneToOne: string;
  priceKs3Group: string;
  lateFeePercent: string;
  passKs36: string;
  passKs310: string;
  passGcse6: string;
  passGcse10: string;
  passValidityMonths: string;
  passMinNoticeDays: string;
  bankAccountName: string;
  bankSortCode: string;
  bankAccountNumber: string;
  teachingAddress: string;
  meetingLink: string;
}

export type SettingsErrors = Partial<Record<keyof SettingsFormInput, string>>;

export type ParsedSettings =
  | { ok: true; settings: Settings; priv: Omit<PrivateSettings, "calendarFeedToken"> }
  | { ok: false; errors: SettingsErrors };

const SORT_CODE = /^\d{2}-?\d{2}-?\d{2}$/;
const ACCOUNT_NUMBER = /^\d{8}$/;
const DISTRICT = /^[A-Z]{1,2}\d[A-Z\d]?$/;
const MAX_TEXT = 300;
const MAX_OWNER_NAME = 80;

/** "25", "25.5" or "25.50" -> pence, or null. No floating point. */
export function poundsToPence(text: string): number | null {
  const m = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || 0);
}

export function parseSettingsInput(input: SettingsFormInput): ParsedSettings {
  const errors: SettingsErrors = {};
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const money = (key: keyof SettingsFormInput, label: string): number => {
    const p = poundsToPence(str(input[key]));
    if (p === null) {
      errors[key] = `${label} must be an amount in pounds, like 25 or 25.50.`;
      return 0;
    }
    return p;
  };
  const whole = (key: keyof SettingsFormInput, label: string, min: number, max: number): number => {
    const t = str(input[key]);
    const n = Number(t);
    if (!/^\d{1,5}$/.test(t) || n < min || n > max) {
      errors[key] = `${label} must be a whole number from ${min} to ${max}.`;
      return min;
    }
    return n;
  };
  const optional = (key: keyof SettingsFormInput, label: string): string | null => {
    const t = str(input[key]);
    if (t.length > MAX_TEXT) errors[key] = `${label} is too long (${MAX_TEXT} characters at most).`;
    return t === "" ? null : t;
  };

  const ownerName = (): string | null => {
    const t = str(input.ownerName).replace(/\s+/g, " ");
    if (t.length > MAX_OWNER_NAME) errors.ownerName = `The owner's name is too long (${MAX_OWNER_NAME} characters at most).`;
    return t === "" ? null : t;
  };

  const districts = str(input.allowedPostcodeDistricts)
    .split(/[\s,]+/)
    .map((d) => d.toUpperCase())
    .filter(Boolean);
  if (districts.some((d) => !DISTRICT.test(d))) {
    errors.allowedPostcodeDistricts = "Use postcode districts like BB1 or BB2, separated by commas.";
  }

  const sortRaw = str(input.bankSortCode);
  let sortCode: string | null = null;
  if (sortRaw) {
    if (SORT_CODE.test(sortRaw)) sortCode = sortRaw.replace(/-/g, "").replace(/(\d{2})(\d{2})(\d{2})/, "$1-$2-$3");
    else errors.bankSortCode = "A sort code is six digits, like 12-34-56.";
  }
  const accountRaw = str(input.bankAccountNumber);
  if (accountRaw && !ACCOUNT_NUMBER.test(accountRaw)) errors.bankAccountNumber = "An account number is eight digits.";

  const link = str(input.meetingLink);
  if (link) {
    let ok = false;
    try {
      ok = ["http:", "https:"].includes(new URL(link).protocol);
    } catch {
      ok = false;
    }
    if (!ok) errors.meetingLink = "Enter a full link starting with https://.";
  }

  const settings: Settings = {
    priceAssessmentPence: money("priceAssessment", "The assessment price"),
    priceOneToOnePence: money("priceOneToOne", "The 1-to-1 price"),
    priceGroupPence: money("priceGroup", "The group price"),
    priceSundayBundlePence: money("priceSundayBundle", "The Sunday bundle price"),
    travelFeePence: money("travelFee", "The travel fee"),
    onlineEnabled: input.onlineEnabled === true,
    homeVisitsEnabled: input.homeVisitsEnabled === true,
    tutorPlaceEnabled: input.tutorPlaceEnabled === true,
    cancellationNoticeHours: whole("cancellationNoticeHours", "Cancellation notice", 0, 720),
    bookingWindowDays: whole("bookingWindowDays", "The booking window", 1, 365),
    minNoticeHours: whole("minNoticeHours", "Minimum notice", 0, 720),
    defaultGroupCapacity: whole("defaultGroupCapacity", "The default group size", 1, 100),
    homeVisitBufferMinutes: whole("homeVisitBufferMinutes", "The home visit buffer", 0, 240),
    allowedPostcodeDistricts: districts,
    flagThreshold: whole("flagThreshold", "The flag threshold", 1, 100),
    groupVenue: optional("groupVenue", "The group venue"),
    businessPhone: optional("businessPhone", "The business phone"),
    businessAddress: optional("businessAddress", "The business address"),
    ownerName: ownerName(),
    priceKs3AssessmentPence: money("priceKs3Assessment", "The KS3 assessment price"),
    priceKs3OneToOnePence: money("priceKs3OneToOne", "The KS3 1-to-1 price"),
    priceKs3GroupPence: money("priceKs3Group", "The KS3 group price"),
    lateFeePercent: whole("lateFeePercent", "The late cancellation fee", 0, 100),
    passPrices: {
      KS3: { "6": money("passKs36", "The KS3 6-session pass price"), "10": money("passKs310", "The KS3 10-session pass price") },
      GCSE: { "6": money("passGcse6", "The GCSE 6-session pass price"), "10": money("passGcse10", "The GCSE 10-session pass price") },
    },
    passValidityMonths: whole("passValidityMonths", "Pass validity", 1, 24),
    passMinNoticeDays: whole("passMinNoticeDays", "Pass booking notice", 0, 30),
  };
  const priv = {
    bankAccountName: optional("bankAccountName", "The account name"),
    bankSortCode: sortCode,
    bankAccountNumber: accountRaw || null,
    teachingAddress: optional("teachingAddress", "The teaching address"),
    meetingLink: link || null,
  };

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, settings, priv };
}

export function settingsToFormInput(s: Settings, p: PrivateSettings): SettingsFormInput {
  const pounds = (pence: number) => (pence % 100 === 0 ? String(pence / 100) : (pence / 100).toFixed(2));
  return {
    priceAssessment: pounds(s.priceAssessmentPence),
    priceOneToOne: pounds(s.priceOneToOnePence),
    priceGroup: pounds(s.priceGroupPence),
    priceSundayBundle: pounds(s.priceSundayBundlePence),
    travelFee: pounds(s.travelFeePence),
    tutorPlaceEnabled: s.tutorPlaceEnabled,
    homeVisitsEnabled: s.homeVisitsEnabled,
    onlineEnabled: s.onlineEnabled,
    cancellationNoticeHours: String(s.cancellationNoticeHours),
    bookingWindowDays: String(s.bookingWindowDays),
    minNoticeHours: String(s.minNoticeHours),
    defaultGroupCapacity: String(s.defaultGroupCapacity),
    homeVisitBufferMinutes: String(s.homeVisitBufferMinutes),
    flagThreshold: String(s.flagThreshold),
    allowedPostcodeDistricts: s.allowedPostcodeDistricts.join(", "),
    groupVenue: s.groupVenue ?? "",
    businessPhone: s.businessPhone ?? "",
    businessAddress: s.businessAddress ?? "",
    ownerName: s.ownerName ?? "",
    priceKs3Assessment: pounds(s.priceKs3AssessmentPence),
    priceKs3OneToOne: pounds(s.priceKs3OneToOnePence),
    priceKs3Group: pounds(s.priceKs3GroupPence),
    lateFeePercent: String(s.lateFeePercent),
    passKs36: pounds(s.passPrices.KS3["6"]),
    passKs310: pounds(s.passPrices.KS3["10"]),
    passGcse6: pounds(s.passPrices.GCSE["6"]),
    passGcse10: pounds(s.passPrices.GCSE["10"]),
    passValidityMonths: String(s.passValidityMonths),
    passMinNoticeDays: String(s.passMinNoticeDays),
    bankAccountName: p.bankAccountName ?? "",
    bankSortCode: p.bankSortCode ?? "",
    bankAccountNumber: p.bankAccountNumber ?? "",
    teachingAddress: p.teachingAddress ?? "",
    meetingLink: p.meetingLink ?? "",
  };
}
