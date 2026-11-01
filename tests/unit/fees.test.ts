import { describe, expect, it } from "vitest";
import { bookingFeePence, lateFeePence } from "@/lib/booking/fees";

const b = (over: Partial<Parameters<typeof bookingFeePence>[0]> = {}) => ({
  status: "late_cancelled" as const,
  location: "tutor_place" as const,
  pricePence: 2500,
  travelFeePence: 0,
  feePence: null,
  ...over,
});

describe("lateFeePence", () => {
  it("is the percentage of the price, rounded", () => {
    expect(lateFeePence(2500, 50)).toBe(1250);
    expect(lateFeePence(750, 50)).toBe(375);
    expect(lateFeePence(1400, 50)).toBe(700);
    expect(lateFeePence(1317, 50)).toBe(659);
    expect(lateFeePence(2500, 0)).toBe(0);
    expect(lateFeePence(2500, 100)).toBe(2500);
  });
});

describe("bookingFeePence", () => {
  it("late cancelled home visit owes 1250, not 1500 (no travel)", () => {
    expect(bookingFeePence(b({ location: "home_visit", travelFeePence: 500 }), 50)).toBe(1250);
  });
  it("no-show home visit owes the fee plus travel", () => {
    expect(bookingFeePence(b({ status: "no_show", location: "home_visit", travelFeePence: 500 }), 50)).toBe(1250 + 500);
  });
  it("no-show at the tutor's place owes the fee only", () => {
    expect(bookingFeePence(b({ status: "no_show" }), 50)).toBe(1250);
  });
  it("attended and confirmed owe price plus travel", () => {
    for (const status of ["attended", "confirmed"] as const) {
      expect(bookingFeePence(b({ status, location: "home_visit", travelFeePence: 500 }), 50)).toBe(3000);
    }
  });
  it("a stored feePence overrides the computed fee", () => {
    expect(bookingFeePence(b({ feePence: 0 }), 50)).toBe(0);
    expect(bookingFeePence(b({ feePence: 300 }), 50)).toBe(300);
    expect(bookingFeePence(b({ status: "no_show", location: "home_visit", travelFeePence: 500, feePence: 0 }), 50)).toBe(500);
  });
  it("uses the given percentage", () => {
    expect(bookingFeePence(b(), 100)).toBe(2500);
  });
});
