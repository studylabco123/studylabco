import { describe, expect, it } from "vitest";
import { blockDuePence, bookingPaymentSummary, paymentBadge, seatDuePence, willBeOwed } from "@/lib/booking/payment-view";
import { creditBalancePence } from "@/lib/booking/owed";
import type { Booking, LedgerEntry } from "@/lib/types";

const now = new Date("2026-11-10T12:00:00Z");
const day = 86400_000;
const mk = (over: Partial<Booking> = {}): Booking => ({
  id: "b", createdAt: now, parentId: "p", childId: "c", kind: "one_to_one", location: "tutor_place",
  startsAt: new Date(now.getTime() + day), endsAt: new Date(now.getTime() + day + 3600_000),
  busyUntil: new Date(now.getTime() + day + 3600_000), groupSessionId: null, blockBookingId: null, bundleId: null,
  status: "confirmed", pricePence: 2500, travelFeePence: 0, paymentReference: "R", paymentStatus: "unpaid",
  homeAddress: null, homePostcode: null, cancelledAt: null, cancelledBy: null, decidedAt: null, ...over,
});

describe("seatDuePence (R11)", () => {
  it("late cancellation is the lesson price only", () => {
    expect(seatDuePence(mk({ status: "late_cancelled", location: "home_visit", travelFeePence: 500 }))).toBe(2500);
  });
  it("confirmed, attended and no-show home visits include travel", () => {
    for (const status of ["confirmed", "attended", "no_show"] as const) {
      expect(seatDuePence(mk({ status, location: "home_visit", travelFeePence: 500 }))).toBe(3000);
    }
  });
  it("cancelled and declined cost nothing", () => {
    expect(seatDuePence(mk({ status: "cancelled" }))).toBe(0);
    expect(seatDuePence(mk({ status: "declined", location: "home_visit" }))).toBe(0);
  });
});

describe("willBeOwed", () => {
  it("unpaid confirmed (even in the future), late cancelled, pending at the tutor's place", () => {
    expect(willBeOwed(mk())).toBe(true);
    expect(willBeOwed(mk({ status: "late_cancelled" }))).toBe(true);
    expect(willBeOwed(mk({ status: "pending" }))).toBe(true);
    expect(willBeOwed(mk({ status: "attended" }))).toBe(true);
  });
  it("not for a pending home visit, a paid booking, or a cancelled one", () => {
    expect(willBeOwed(mk({ status: "pending", location: "home_visit" }))).toBe(false);
    expect(willBeOwed(mk({ paymentStatus: "paid" }))).toBe(false);
    expect(willBeOwed(mk({ paymentStatus: "credited", status: "cancelled" }))).toBe(false);
    expect(willBeOwed(mk({ status: "cancelled" }))).toBe(false);
  });
});

describe("paymentBadge", () => {
  it("names each payment state", () => {
    expect(paymentBadge(mk({ paymentStatus: "paid" }))?.text).toBe("Paid");
    expect(paymentBadge(mk())?.text).toBe("Unpaid");
    expect(paymentBadge(mk({ paymentStatus: "credited", status: "cancelled" }))?.text).toBe("Credited");
    expect(paymentBadge(mk({ paymentStatus: "refunded", status: "cancelled" }))?.text).toBe("Refunded");
    expect(paymentBadge(mk({ paymentStatus: "waived", status: "late_cancelled" }))?.text).toBe("Waived");
  });
  it("shows nothing for an unpaid booking that will never be owed", () => {
    expect(paymentBadge(mk({ status: "cancelled" }))).toBeNull();
    expect(paymentBadge(mk({ status: "declined", location: "home_visit" }))).toBeNull();
    expect(paymentBadge(mk({ status: "pending", location: "home_visit" }))).toBeNull();
  });
});

describe("blockDuePence (I3)", () => {
  const seat = (id: string, status: Booking["status"], price = 1700) => mk({ id, status, pricePence: price, blockBookingId: "blk", kind: "group" });
  it("is the block price minus seats cancelled for free", () => {
    expect(blockDuePence(10200, [seat("1", "confirmed"), seat("2", "cancelled"), seat("3", "cancelled")])).toBe(10200 - 3400);
  });
  it("late-cancelled weeks are still charged", () => {
    expect(blockDuePence(10200, [seat("1", "late_cancelled"), seat("2", "confirmed")])).toBe(10200);
  });
  it("never goes below zero", () => {
    expect(blockDuePence(1000, [seat("1", "cancelled", 1700)])).toBe(0);
  });
});

describe("bookingPaymentSummary (I1)", () => {
  it("a paid booking asks for nothing", () => {
    const s = bookingPaymentSummary([mk({ paymentStatus: "paid" })], null);
    expect(s).toMatchObject({ totalPence: 2500, toPayPence: 0, showHowToPay: false, awaitingApproval: false });
  });
  it("an unpaid confirmed booking asks for price plus travel", () => {
    const s = bookingPaymentSummary([mk({ location: "home_visit", travelFeePence: 500 })], null);
    expect(s).toMatchObject({ totalPence: 3000, toPayPence: 3000, showHowToPay: true });
  });
  it("a late-cancelled home visit asks for the price only (R11)", () => {
    const s = bookingPaymentSummary([mk({ status: "late_cancelled", location: "home_visit", travelFeePence: 500 })], null);
    expect(s).toMatchObject({ totalPence: 2500, toPayPence: 2500, showHowToPay: true });
  });
  it("a pending home visit is awaiting approval and does not ask for payment", () => {
    const s = bookingPaymentSummary([mk({ status: "pending", location: "home_visit", travelFeePence: 500 })], null);
    expect(s).toMatchObject({ toPayPence: 0, showHowToPay: false, awaitingApproval: true });
  });
  it("an attended paid booking or a free-cancelled one asks for nothing", () => {
    expect(bookingPaymentSummary([mk({ status: "attended", paymentStatus: "paid" })], null).showHowToPay).toBe(false);
    expect(bookingPaymentSummary([mk({ status: "cancelled", paymentStatus: "credited" })], null)).toMatchObject({ totalPence: 0, showHowToPay: false });
  });
  it("a Sunday bundle leaves out a seat cancelled for free", () => {
    const rows = [mk({ id: "a", bundleId: "x", pricePence: 1500 }), mk({ id: "b", bundleId: "x", pricePence: 1500, status: "cancelled" })];
    expect(bookingPaymentSummary(rows, null)).toMatchObject({ totalPence: 1500, toPayPence: 1500, showHowToPay: true });
  });
  it("a held block owes the block price less free-cancelled weeks", () => {
    const rows = [1, 2, 3].map((i) => mk({ id: String(i), blockBookingId: "blk", pricePence: 1700, status: i === 2 ? "cancelled" : "confirmed" }));
    expect(bookingPaymentSummary(rows, { pricePence: 5100, status: "held" })).toMatchObject({ totalPence: 3400, toPayPence: 3400, showHowToPay: true });
  });
  it("a paid block asks for nothing", () => {
    const rows = [1, 2].map((i) => mk({ id: String(i), blockBookingId: "blk", pricePence: 1700, paymentStatus: "paid" }));
    expect(bookingPaymentSummary(rows, { pricePence: 3400, status: "paid" })).toMatchObject({ totalPence: 3400, toPayPence: 0, showHowToPay: false });
  });
  it("a released block owes only its unpaid live seats one by one", () => {
    const rows = [
      mk({ id: "1", blockBookingId: "blk", pricePence: 1700, status: "attended" }),
      mk({ id: "2", blockBookingId: "blk", pricePence: 1700, status: "cancelled" }),
    ];
    expect(bookingPaymentSummary(rows, { pricePence: 3400, status: "released" })).toMatchObject({ totalPence: 1700, toPayPence: 1700, showHowToPay: true });
  });
});

describe("creditBalancePence (R23)", () => {
  const led = (kind: LedgerEntry["kind"], amountPence: number, parentId = "p"): LedgerEntry => ({
    id: Math.random().toString(), createdAt: now, bookingId: null, blockBookingId: null, parentId, kind, method: null, amountPence, occurredOn: "2026-11-10", note: "",
  });
  it("is credit issued minus credit applied, ignoring payments, refunds and waivers", () => {
    const l = [led("credit", 2500), led("credit", 1700), led("credit_applied", 2500), led("payment", 9999), led("refund", 100), led("waiver", 300)];
    expect(creditBalancePence(l, "p")).toBe(1700);
  });
  it("counts only the given family", () => {
    expect(creditBalancePence([led("credit", 2500, "other")], "p")).toBe(0);
  });
});
