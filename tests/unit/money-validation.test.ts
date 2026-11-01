import { describe, expect, test } from "vitest";
import { checkReceipt, MAX_RECEIPT_BYTES, parseExpense, parseMiles } from "@/lib/money/validation";

const ok = { date: "2026-11-03", category: "stationery", description: "Pens", amount: "21.50" };
const today = "2026-11-10";

describe("parseExpense", () => {
  test("pounds become pence without floats", () => {
    expect(parseExpense(ok, today)).toEqual({ ok: true, value: { spentOn: "2026-11-03", category: "stationery", description: "Pens", amountPence: 2150 } });
    expect(parseExpense({ ...ok, amount: "0.07" }, today)).toMatchObject({ value: { amountPence: 7 } });
    expect(parseExpense({ ...ok, amount: "19.99" }, today)).toMatchObject({ value: { amountPence: 1999 } });
  });
  test.each(["", "abc", "-5", "0", "0.00", "1.234", "£5"])("rejects amount %j", (amount) => {
    expect(parseExpense({ ...ok, amount }, today).ok).toBe(false);
  });
  test("rejects unknown category, bad and future dates", () => {
    expect(parseExpense({ ...ok, category: "yacht" }, today).ok).toBe(false);
    expect(parseExpense({ ...ok, date: "2026-02-30" }, today).ok).toBe(false);
    expect(parseExpense({ ...ok, date: "2026-11-11" }, today).ok).toBe(false);
  });
});

describe("checkReceipt", () => {
  test("accepts images and pdf up to 10 MB", () => {
    expect(checkReceipt({ size: 1000, type: "image/jpeg" })).toEqual({ ok: true, value: { ext: "jpg" } });
    expect(checkReceipt({ size: MAX_RECEIPT_BYTES, type: "application/pdf" })).toEqual({ ok: true, value: { ext: "pdf" } });
  });
  test("rejects too big, wrong type, empty", () => {
    expect(checkReceipt({ size: MAX_RECEIPT_BYTES + 1, type: "image/png" }).ok).toBe(false);
    expect(checkReceipt({ size: 10, type: "text/html" }).ok).toBe(false);
    expect(checkReceipt({ size: 0, type: "image/png" }).ok).toBe(false);
  });
});

describe("parseMiles", () => {
  test("accepts whole and one-decimal miles", () => {
    expect(parseMiles("12")).toBe(12);
    expect(parseMiles("12.5")).toBe(12.5);
    expect(parseMiles(0)).toBe(0);
  });
  test("rejects the rest", () => {
    for (const v of ["", "-1", "1.25", "abc", "12345", null, undefined]) expect(parseMiles(v)).toBeNull();
  });
});

describe("receipt types and paths", () => {
  test("svg and gif are refused", () => {
    expect(checkReceipt({ size: 10, type: "image/svg+xml" }).ok).toBe(false);
    expect(checkReceipt({ size: 10, type: "image/gif" }).ok).toBe(false);
  });
  test("only receipts/YYYY/uuid.ext keys match", async () => {
    const { RECEIPT_PATH } = await import("@/lib/money/validation");
    expect(RECEIPT_PATH.test("receipts/2026/0b9d6f2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.jpg")).toBe(true);
    for (const p of ["../x.jpg", "receipts/2026/x.jpg", "receipts/2026/0b9d6f2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.svg", "other/2026/0b9d6f2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.jpg"])
      expect(RECEIPT_PATH.test(p)).toBe(false);
  });
});
