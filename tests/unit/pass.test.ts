import { describe, expect, test } from "vitest";
import {
  passCardText,
  passExpiryFrom,
  passInCoolingOff,
  passRemaining,
  passSessionValuePence,
  passSessionValues,
  passUnusedValuePence,
  passUsable,
  sessionsNeeded,
} from "@/lib/booking/pass";
import type { BookingStatus, Pass } from "@/lib/types";

const PASS: Pass = {
  id: "p1",
  createdAt: new Date("2026-11-01T09:00:00Z"),
  parentId: "parent",
  childId: "child",
  level: "KS3",
  sessionsTotal: 6,
  pricePence: 7900,
  paymentReference: "SLC-1234",
  status: "active",
  paidAt: new Date("2026-11-02T10:00:00Z"),
  expiresAt: new Date("2027-05-02T10:00:00Z"),
};

const seat = (status: BookingStatus, passId: string | null = "p1") => ({ status, passId });

describe("passRemaining", () => {
  test("remaining counts pending/confirmed/attended only", () => {
    const seats = [
      seat("pending"),
      seat("confirmed"),
      seat("attended"),
      seat("late_cancelled"),
      seat("no_show"),
      seat("cancelled"),
      seat("declined"),
      // Another pass's seat and a seat paid for on its own do not count.
      seat("confirmed", "p2"),
      seat("confirmed", null),
    ];
    expect(passRemaining(PASS, seats)).toBe(3);
  });

  test("never below zero", () => {
    expect(passRemaining({ ...PASS, sessionsTotal: 6 }, Array.from({ length: 8 }, () => seat("confirmed")))).toBe(0);
  });
});

describe("pass value", () => {
  test("session value split sums to price", () => {
    for (const [price, n] of [
      [7900, 6],
      [12600, 10],
      [10200, 6],
      [16200, 10],
      [7901, 6],
    ] as const) {
      const parts = passSessionValues({ pricePence: price, sessionsTotal: n });
      expect(parts).toHaveLength(n);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(price);
    }
    // R3: the remainder sits on the first session.
    expect(passSessionValues({ pricePence: 7900, sessionsTotal: 6 })).toEqual([1320, 1316, 1316, 1316, 1316, 1316]);
  });

  test("the per-session value for fees is the floor of price / sessions", () => {
    expect(passSessionValuePence({ pricePence: 7900, sessionsTotal: 6 })).toBe(1316);
    expect(passSessionValuePence({ pricePence: 16200, sessionsTotal: 10 })).toBe(1620);
  });

  test("unused value: all of it when untouched, else the last parts of the split", () => {
    expect(passUnusedValuePence(PASS, 6)).toBe(7900);
    expect(passUnusedValuePence(PASS, 4)).toBe(4 * 1316);
    expect(passUnusedValuePence(PASS, 0)).toBe(0);
  });
});

describe("passUsable", () => {
  test("usable only when active and before expiry", () => {
    const before = new Date("2027-05-02T09:59:00Z");
    const after = new Date("2027-05-02T10:00:00Z");
    expect(passUsable(PASS, before)).toBe(true);
    expect(passUsable(PASS, after)).toBe(false);
    expect(passUsable({ ...PASS, status: "awaiting_payment", expiresAt: null }, before)).toBe(false);
    expect(passUsable({ ...PASS, status: "expired" }, before)).toBe(false);
    expect(passUsable({ ...PASS, status: "cancelled" }, before)).toBe(false);
    expect(passUsable({ ...PASS, expiresAt: null }, before)).toBe(false);
  });
});

describe("pass dates", () => {
  test("expiry is calendar months after payment, in London time", () => {
    // 10:00 GMT in November is 11:00 BST in May: same London wall-clock time.
    expect(passExpiryFrom(new Date("2026-11-02T10:00:00Z"), 6).toISOString()).toBe("2027-05-02T09:00:00.000Z");
    // 31 August + 6 months clamps to the end of February.
    expect(passExpiryFrom(new Date("2026-08-31T11:00:00Z"), 6).toISOString()).toBe("2027-02-28T12:00:00.000Z");
  });

  test("cooling-off is 14 days from purchase", () => {
    expect(passInCoolingOff(PASS, new Date("2026-11-15T09:00:00Z"))).toBe(true);
    expect(passInCoolingOff(PASS, new Date("2026-11-15T09:01:00Z"))).toBe(false);
  });
});

describe("pass card and bundles", () => {
  test("card text names the level, sessions left and expiry", () => {
    expect(passCardText(PASS, 4)).toBe("KS3 group pass — 4 of 6 sessions left — expires 2 May 2027");
    expect(passCardText({ ...PASS, status: "awaiting_payment", expiresAt: null }, 6)).toBe("KS3 group pass — 6 sessions — awaiting payment");
  });

  test("a Sunday bundle uses 2 sessions", () => {
    expect(sessionsNeeded("session")).toBe(1);
    expect(sessionsNeeded("sunday_bundle")).toBe(2);
  });
});
