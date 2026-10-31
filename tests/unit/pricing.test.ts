import { describe, expect, it } from "vitest";
import { quote } from "@/lib/booking/pricing";
import { SETTINGS } from "./fixtures";

describe("quote", () => {
  it("assessment tutor_place = 1000", () => {
    expect(quote({ type: "assessment", location: "tutor_place" }, SETTINGS).totalPence).toBe(1000);
  });
  it("assessment home_visit = 1500 (base 1000, travel 500)", () => {
    const q = quote({ type: "assessment", location: "home_visit" }, SETTINGS);
    expect(q).toMatchObject({ basePence: 1000, travelPence: 500, totalPence: 1500 });
  });
  it("1-to-1 home_visit = 3000", () => {
    expect(quote({ type: "one_to_one", location: "home_visit" }, SETTINGS).totalPence).toBe(3000);
  });
  it("group = 1800", () => {
    expect(quote({ type: "group" }, SETTINGS).totalPence).toBe(1800);
  });
  it("sunday_bundle = 3000 split [1500,1500]", () => {
    const q = quote({ type: "sunday_bundle" }, SETTINGS);
    expect(q.totalPence).toBe(3000);
    expect(q.perBookingPence).toEqual([1500, 1500]);
  });
  it("block saturday 6 = 10200 split six ways", () => {
    const q = quote({ type: "block", product: "saturday", weeks: 6 }, SETTINGS);
    expect(q.totalPence).toBe(10200);
    expect(q.perBookingPence).toEqual([1700, 1700, 1700, 1700, 1700, 1700]);
  });
  it("block sunday_bundle 10 = 27000 across 20 bookings", () => {
    const q = quote({ type: "block", product: "sunday_bundle", weeks: 10 }, SETTINGS);
    expect(q.totalPence).toBe(27000);
    expect(q.perBookingPence).toEqual(Array(20).fill(1350));
  });
  it("block saturday 10 = 16200", () => {
    expect(quote({ type: "block", product: "saturday", weeks: 10 }, SETTINGS).totalPence).toBe(16200);
  });
  it("puts the remainder on the first booking", () => {
    const s = { ...SETTINGS, blockPrices: { ...SETTINGS.blockPrices, saturday: { 6: 10201, 10: 16200 } } };
    const q = quote({ type: "block", product: "saturday", weeks: 6 }, s);
    expect(q.perBookingPence).toEqual([1701, 1700, 1700, 1700, 1700, 1700]);
  });
});
