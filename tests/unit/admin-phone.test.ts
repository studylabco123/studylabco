import { describe, expect, test } from "vitest";
import { mailtoHref, telHref, toE164, whatsappHref } from "@/lib/admin/phone";

describe("toE164", () => {
  test.each([
    ["07123 456789", "+447123456789"],
    ["07123456789", "+447123456789"],
    ["+44 7123 456789", "+447123456789"],
    ["+447123456789", "+447123456789"],
    ["447123456789", "+447123456789"],
    ["0044 7123 456789", "+447123456789"],
    ["(07123) 456-789", "+447123456789"],
    ["01632 960123", "+441632960123"],
    ["", null],
    ["abc", null],
    ["123", null],
  ])("%s -> %s", (raw, out) => expect(toE164(raw)).toBe(out));
});

describe("contact links", () => {
  test("tel and WhatsApp links use the international number", () => {
    expect(telHref("07123 456789")).toBe("tel:+447123456789");
    expect(whatsappHref("07123 456789")).toBe("https://wa.me/447123456789");
  });
  test("an unreadable number gives no WhatsApp link and a plain tel link", () => {
    expect(whatsappHref("ask mum")).toBeNull();
    expect(telHref("ask mum")).toBeNull();
    expect(telHref(null)).toBeNull();
  });
  test("mailto encodes the address", () => {
    expect(mailtoHref("pat@example.test")).toBe("mailto:pat@example.test");
    expect(mailtoHref("a+b@example.test")).toBe("mailto:a%2Bb@example.test");
    expect(mailtoHref("")).toBeNull();
  });
});
