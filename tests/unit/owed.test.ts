import { describe, expect, it } from "vitest";
import { amountOwedPence, isFlagged } from "@/lib/booking/owed";
import type { Booking } from "@/lib/types";

const now = new Date("2026-11-10T12:00:00Z");
const day = 86400_000;
const mk = (over: Partial<Booking> = {}): Booking => ({
  id: "b", createdAt: now, parentId: "p", childId: "c", kind: "one_to_one", location: "tutor_place",
  startsAt: new Date(now.getTime() - day), endsAt: new Date(now.getTime() - day + 3600_000),
  busyUntil: new Date(now.getTime() - day + 3600_000), groupSessionId: null, blockBookingId: null, bundleId: null,
  status: "attended", pricePence: 2500, travelFeePence: 0, paymentReference: "R", paymentStatus: "unpaid",
  homeAddress: null, homePostcode: null, cancelledAt: null, cancelledBy: null, decidedAt: null, ...over,
});

describe("amountOwedPence", () => {
  it("late cancellation unpaid counts", () => {
    expect(amountOwedPence([mk({ status: "late_cancelled", startsAt: new Date(now.getTime() + day) })], [], now)).toBe(2500);
  });
  it("future confirmed unpaid does not count", () => {
    expect(amountOwedPence([mk({ status: "confirmed", startsAt: new Date(now.getTime() + day) })], [], now)).toBe(0);
  });
  it("past confirmed, no_show, attended unpaid count; travel included", () => {
    const bs = [mk({ status: "confirmed" }), mk({ status: "no_show" }), mk({ status: "attended", travelFeePence: 500 })];
    expect(amountOwedPence(bs, [], now)).toBe(2500 + 2500 + 3000);
  });
  it("starting exactly now counts", () => {
    expect(amountOwedPence([mk({ status: "confirmed", startsAt: now })], [], now)).toBe(2500);
  });
  it("waived/paid/credited/refunded do not count", () => {
    for (const paymentStatus of ["waived", "paid", "credited", "refunded"] as const) {
      expect(amountOwedPence([mk({ paymentStatus })], [], now)).toBe(0);
    }
  });
  it("pending, declined, cancelled do not count", () => {
    for (const status of ["pending", "declined", "cancelled"] as const) {
      expect(amountOwedPence([mk({ status })], [], now)).toBe(0);
    }
  });
  it("uses stored booking price", () => {
    expect(amountOwedPence([mk({ pricePence: 2500 })], [], now)).toBe(2500);
  });
});

describe("isFlagged", () => {
  const late = (daysAgo: number) => mk({ status: "late_cancelled", startsAt: new Date(now.getTime() - daysAgo * day) });
  it("true at 2 within a year", () => {
    expect(isFlagged([late(10), mk({ status: "no_show" })], now, 2)).toBe(true);
  });
  it("false when one is older than 365 days", () => {
    expect(isFlagged([late(10), late(400)], now, 2)).toBe(false);
  });
});
