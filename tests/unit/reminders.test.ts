import { describe, expect, it } from "vitest";
import { dueReminders, expiredBlockHolds, blocksNeedingPaymentReminder } from "@/lib/email/reminders";
import type { Booking } from "@/lib/types";

const NOW = new Date("2026-11-02T07:00:00Z");
const H = 3600_000;

function booking(hoursAway: number, over: Partial<Booking> = {}): Booking {
  const startsAt = new Date(NOW.getTime() + hoursAway * H);
  return {
    id: `b-${hoursAway}`,
    createdAt: NOW,
    parentId: "p",
    childId: "c",
    kind: "one_to_one",
    location: "tutor_place",
    startsAt,
    endsAt: new Date(startsAt.getTime() + H),
    busyUntil: new Date(startsAt.getTime() + H),
    groupSessionId: null,
    blockBookingId: null,
    bundleId: null,
    status: "confirmed",
    pricePence: 2500,
    travelFeePence: 0,
    paymentReference: "SLC-1001",
    paymentStatus: "unpaid",
    homeAddress: null,
    homePostcode: null,
    cancelledAt: null,
    cancelledBy: null,
    decidedAt: null,
    ...over,
  };
}

describe("dueReminders", () => {
  it("lesson 30h away -> lesson_reminder", () => {
    expect(dueReminders([booking(30)], NOW)).toEqual([{ bookingId: "b-30", template: "lesson_reminder" }]);
  });

  it("lesson 72h away -> free_cancel_reminder with deadline 24h from now", () => {
    const r = dueReminders([booking(72)], NOW);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ bookingId: "b-72", template: "free_cancel_reminder" });
    expect((r[0] as { freeCancelUntil: Date }).freeCancelUntil.getTime()).toBe(NOW.getTime() + 24 * H);
  });

  it("cancelled booking -> none", () => {
    expect(dueReminders([booking(30, { status: "cancelled" }), booking(72, { status: "late_cancelled" })], NOW)).toEqual([]);
  });

  it("lesson 40h away -> none", () => {
    expect(dueReminders([booking(40)], NOW)).toEqual([]);
  });

  it("windows are (0, 36h] and (48h, 96h]", () => {
    expect(dueReminders([booking(36)], NOW).map((r) => r.template)).toEqual(["lesson_reminder"]);
    expect(dueReminders([booking(48)], NOW)).toEqual([]);
    expect(dueReminders([booking(96)], NOW).map((r) => r.template)).toEqual(["free_cancel_reminder"]);
    expect(dueReminders([booking(97)], NOW)).toEqual([]);
    expect(dueReminders([booking(0)], NOW)).toEqual([]);
    expect(dueReminders([booking(-1)], NOW)).toEqual([]);
  });

  it("ignores pending bookings", () => {
    expect(dueReminders([booking(30, { status: "pending" })], NOW)).toEqual([]);
  });
});

describe("blocks", () => {
  const block = (over: Record<string, unknown> = {}) => ({
    id: "k",
    status: "held",
    createdAt: new Date(NOW.getTime() - 49 * H),
    holdExpiresAt: new Date(NOW.getTime() + 23 * H),
    ...over,
  });

  it("expiredBlockHolds returns unpaid held blocks past their hold", () => {
    const expired = block({ holdExpiresAt: new Date(NOW.getTime() - H) });
    expect(expiredBlockHolds([expired, block(), block({ status: "paid", holdExpiresAt: new Date(NOW.getTime() - H) })], NOW)).toEqual([expired]);
  });

  it("blocksNeedingPaymentReminder wants held blocks 48h old or more that have not expired", () => {
    expect(blocksNeedingPaymentReminder([block()], NOW)).toHaveLength(1);
    expect(blocksNeedingPaymentReminder([block({ createdAt: new Date(NOW.getTime() - 47 * H) })], NOW)).toHaveLength(0);
    expect(blocksNeedingPaymentReminder([block({ status: "paid" })], NOW)).toHaveLength(0);
    expect(blocksNeedingPaymentReminder([block({ holdExpiresAt: new Date(NOW.getTime() - H) })], NOW)).toHaveLength(0);
  });
});
