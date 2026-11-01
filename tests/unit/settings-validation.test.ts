import { describe, expect, test } from "vitest";
import { parseSettingsInput, poundsToPence, settingsToFormInput, type SettingsFormInput } from "@/lib/admin/settings-validation";
import type { PrivateSettings } from "@/lib/types";
import { SETTINGS } from "./fixtures";

const settings = () => SETTINGS;
const privateSettings = (): PrivateSettings => ({
  bankAccountName: "Study Lab Co",
  bankSortCode: "12-34-56",
  bankAccountNumber: "12345678",
  teachingAddress: "1 Tutor Road, Blackburn",
  meetingLink: "https://meet.example.test/abc",
  calendarFeedToken: "tok",
});

const base = (): SettingsFormInput => settingsToFormInput(settings(), privateSettings());

describe("poundsToPence", () => {
  test.each([
    ["25", 2500],
    ["25.5", 2550],
    ["25.05", 2505],
    ["0", 0],
    [" 18.00 ", 1800],
  ])("%s -> %s", (text, pence) => expect(poundsToPence(text)).toBe(pence));
  test.each(["", "-1", "abc", "1.234", "£5", "1e3"])("rejects %j", (t) => expect(poundsToPence(t)).toBeNull());
});

describe("parseSettingsInput", () => {
  test("round-trips the current settings", () => {
    const res = parseSettingsInput(base());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.settings).toEqual(settings());
      expect(res.priv.bankSortCode).toBe(privateSettings().bankSortCode);
    }
  });

  test("normalises a sort code and accepts it with or without dashes", () => {
    for (const code of ["123456", "12-34-56", "12-3456"]) {
      const res = parseSettingsInput({ ...base(), bankSortCode: code });
      expect(res.ok && res.priv.bankSortCode).toBe("12-34-56");
    }
  });

  test.each(["12-34-5", "1234567", "ab-cd-ef", "12 34 56"])("rejects sort code %j", (code) => {
    const res = parseSettingsInput({ ...base(), bankSortCode: code });
    expect(!res.ok && res.errors.bankSortCode).toBeTruthy();
  });

  test.each(["1234567", "123456789", "1234 5678", "abcdefgh"])("rejects account number %j", (n) => {
    const res = parseSettingsInput({ ...base(), bankAccountNumber: n });
    expect(!res.ok && res.errors.bankAccountNumber).toBeTruthy();
  });

  test("bank details may be left empty", () => {
    const res = parseSettingsInput({ ...base(), bankSortCode: "", bankAccountNumber: "", bankAccountName: "" });
    expect(res.ok && res.priv.bankSortCode).toBeNull();
  });

  test("reports every bad field, and blocks the three location toggles being read as truthy strings", () => {
    const res = parseSettingsInput({
      ...base(),
      priceGroup: "free",
      bookingWindowDays: "0",
      allowedPostcodeDistricts: "BB1, nonsense!",
      meetingLink: "javascript:alert(1)",
      onlineEnabled: "yes" as unknown as boolean,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(Object.keys(res.errors).sort()).toEqual(["allowedPostcodeDistricts", "bookingWindowDays", "meetingLink", "priceGroup"]);
  });

  test("a non-boolean toggle value is treated as off", () => {
    const res = parseSettingsInput({ ...base(), onlineEnabled: "yes" as unknown as boolean });
    expect(res.ok && res.settings.onlineEnabled).toBe(false);
  });

  test("owner name: optional, trimmed, at most 80 characters (R24)", () => {
    const empty = parseSettingsInput({ ...base(), ownerName: "  " });
    expect(empty.ok && empty.settings.ownerName).toBeNull();
    const named = parseSettingsInput({ ...base(), ownerName: "  Jane Smith " });
    expect(named.ok && named.settings.ownerName).toBe("Jane Smith");
    expect(parseSettingsInput({ ...base(), ownerName: "x".repeat(80) }).ok).toBe(true);
    const long = parseSettingsInput({ ...base(), ownerName: "x".repeat(81) });
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.errors.ownerName).toBe("The owner's name is too long (80 characters at most).");
  });
  test("districts are upper-cased and de-spaced", () => {
    const res = parseSettingsInput({ ...base(), allowedPostcodeDistricts: "bb1 bb2,bb10" });
    expect(res.ok && res.settings.allowedPostcodeDistricts).toEqual(["BB1", "BB2", "BB10"]);
  });

  test("parses the v2 fields in pence-safe pounds", () => {
    const res = parseSettingsInput({ ...base(), priceKs3Assessment: "7.50", passKs36: "79", passGcse10: "162.00", lateFeePercent: "25", passValidityMonths: "12", passMinNoticeDays: "0" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.settings.priceKs3AssessmentPence).toBe(750);
      expect(res.settings.passPrices.KS3["6"]).toBe(7900);
      expect(res.settings.passPrices.GCSE["10"]).toBe(16200);
      expect(res.settings.lateFeePercent).toBe(25);
      expect(res.settings.passValidityMonths).toBe(12);
      expect(res.settings.passMinNoticeDays).toBe(0);
    }
  });

  test.each([
    ["lateFeePercent", "101"],
    ["lateFeePercent", "-1"],
    ["passValidityMonths", "0"],
    ["passValidityMonths", "25"],
    ["passMinNoticeDays", "31"],
    ["priceKs3Group", "14.999"],
    ["passKs310", "abc"],
  ] as const)("rejects %s = %s", (key, value) => {
    const res = parseSettingsInput({ ...base(), [key]: value });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors[key]).toBeTruthy();
  });
});
