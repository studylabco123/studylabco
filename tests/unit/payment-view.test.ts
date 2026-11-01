import { describe, expect, it } from "vitest";
import { bookingPaymentSummary, paymentBadge, seatDuePence, willBeOwed } from "@/lib/booking/payment-view";
import { creditBalancePence } from "@/lib/booking/owed";
import type { Booking, LedgerEntry } from "@/lib/types";

const now = new Date("2026-11-10T12:00:00Z");
const day = 86400_000;
const mk = (over: Partial<Booking> = {}): Booking => ({
  id: "b", createdAt: now, parentId: "p", childId: "c", kind: "one_to_one", location: "tutor_place",
  startsAt: new Date(now.getTime() + day), endsAt: new Date(now.getTime() + day + 3600_000),
  busyUntil: new Date(now.getTime() + day + 3600_000), groupSessionId: null, blockBookingId: null, passId: null, feePence: null, bundleId: null,
  status: "confirmed", pricePence: 2500, travelFeePence: 0, paymentReference: "R", paymentStatus: "unpaid",
  homeAddress: null, homePostcode: null, cancelledAt: null, cancelledBy: null, decidedAt: null, ...over,
});

describe("seatDuePence (R11)", () => {
  it("late cancellation is 50% of the lesson price, no travel", () => {
    expect(seatDuePence(mk({ status: "late_cancelled", location: "home_visit", travelFeePence: 500 }))).toBe(1250);
  });
  it("a no-show home visit is the fee plus travel", () => {
    expect(seatDuePence(mk({ status: "no_show", location: "home_visit", travelFeePence: 500 }))).toBe(1750);
  });
  it("a stored feePence overrides the fee", () => {
    expect(seatDuePence(mk({ status: "late_cancelled", feePence: 0 }))).toBe(0);
  });
  it("confirmed and attended home visits include travel", () => {
    for (const status of ["confirmed", "attended"] as const) {
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

describe("bookingPaymentSummary (I1)", () => {
  it("a paid booking asks for nothing", () => {
    const s = bookingPaymentSummary([mk({ paymentStatus: "paid" })]);
    expect(s).toMatchObject({ totalPence: 2500, toPayPence: 0, showHowToPay: false, awaitingApproval: false });
  });
  it("an unpaid confirmed booking asks for price plus travel", () => {
    const s = bookingPaymentSummary([mk({ location: "home_visit", travelFeePence: 500 })]);
    expect(s).toMatchObject({ totalPence: 3000, toPayPence: 3000, showHowToPay: true });
  });
  it("a late-cancelled home visit asks for 50% of the price (no travel)", () => {
    const s = bookingPaymentSummary([mk({ status: "late_cancelled", location: "home_visit", travelFeePence: 500 })]);
    expect(s).toMatchObject({ totalPence: 1250, toPayPence: 1250, showHowToPay: true });
  });
  it("a pending home visit is awaiting approval and does not ask for payment", () => {
    const s = bookingPaymentSummary([mk({ status: "pending", location: "home_visit", travelFeePence: 500 })]);
    expect(s).toMatchObject({ toPayPence: 0, showHowToPay: false, awaitingApproval: true });
  });
  it("an attended paid booking or a free-cancelled one asks for nothing", () => {
    expect(bookingPaymentSummary([mk({ status: "attended", paymentStatus: "paid" })]).showHowToPay).toBe(false);
    expect(bookingPaymentSummary([mk({ status: "cancelled", paymentStatus: "credited" })])).toMatchObject({ totalPence: 0, showHowToPay: false });
  });
  it("a Sunday bundle leaves out a seat cancelled for free", () => {
    const rows = [mk({ id: "a", bundleId: "x", pricePence: 1500 }), mk({ id: "b", bundleId: "x", pricePence: 1500, status: "cancelled" })];
    expect(bookingPaymentSummary(rows)).toMatchObject({ totalPence: 1500, toPayPence: 1500, showHowToPay: true });
  });
  it("a seat booked with a group pass asks for nothing; a late-cancelled one asks for its fee", () => {
    const seat = mk({ kind: "group", passId: "p1", pricePence: 1316, paymentStatus: "paid" });
    expect(bookingPaymentSummary([seat])).toMatchObject({ toPayPence: 0, showHowToPay: false });
    const late = mk({ kind: "group", passId: "p1", pricePence: 1316, status: "late_cancelled", feePence: 658 });
    expect(bookingPaymentSummary([late])).toMatchObject({ toPayPence: 658, showHowToPay: true });
  });
});

describe("creditBalancePence (R23)", () => {
  const led = (kind: LedgerEntry["kind"], amountPence: number, parentId = "p"): LedgerEntry => ({
    id: Math.random().toString(), createdAt: now, bookingId: null, blockBookingId: null, passId: null, parentId, kind, method: null, amountPence, occurredOn: "2026-11-10", note: "",
  });
  it("is credit issued minus credit applied, ignoring payments, refunds and waivers", () => {
    const l = [led("credit", 2500), led("credit", 1700), led("credit_applied", 2500), led("payment", 9999), led("refund", 100), led("waiver", 300)];
    expect(creditBalancePence(l, "p")).toBe(1700);
  });
  it("counts only the given family", () => {
    expect(creditBalancePence([led("credit", 2500, "other")], "p")).toBe(0);
  });
});
