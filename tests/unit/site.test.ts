import { describe, expect, test } from "vitest";
import { LEGAL_NAV, MAIN_NAV, TRUST_BADGES, telHref, whatsappHref } from "@/lib/site";

describe("telHref", () => {
  test("converts a UK mobile to international format", () => {
    expect(telHref("07700 900123")).toBe("tel:+447700900123");
  });
  test("keeps an international number", () => {
    expect(telHref("+44 7700 900123")).toBe("tel:+447700900123");
  });
});

describe("whatsappHref", () => {
  test("uses the international number without the plus", () => {
    expect(whatsappHref("07700 900123")).toBe("https://wa.me/447700900123");
    expect(whatsappHref("+44 7700 900123")).toBe("https://wa.me/447700900123");
  });
});

describe("site navigation", () => {
  test("legal links cover every policy page", () => {
    expect(LEGAL_NAV.map((l) => l.href)).toEqual([
      "/terms",
      "/refunds",
      "/privacy",
      "/cookies",
      "/safeguarding",
      "/accessibility",
    ]);
  });
  test("main nav never mentions online lessons", () => {
    expect(MAIN_NAV.some((l) => /online/i.test(l.label))).toBe(false);
  });
  test("badge copy matches the spec", () => {
    expect(TRUST_BADGES.join(" · ")).toBe("Qualified Teacher (QTS) · Enhanced DBS Checked · All Exam Boards");
  });
});
