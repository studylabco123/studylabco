import { describe, expect, it } from "vitest";
import { cancellationDecision, parentCanCancelOnline, cancellationOutcome, freeCancellationEnds, inCoolingOff } from "@/lib/booking/cancellation";

const start = new Date("2026-11-10T17:00:00Z");
const H = 3600_000;
describe("cancellationOutcome", () => {
  it("exactly 48h before is free", () => {
    expect(cancellationOutcome(start, new Date(start.getTime() - 48 * H), 48, "parent")).toBe("free");
  });
  it("47h59m before is late", () => {
    expect(cancellationOutcome(start, new Date(start.getTime() - 47 * H - 59 * 60_000), 48, "parent")).toBe("late");
  });
  it("tutor cancels 1h before is free", () => {
    expect(cancellationOutcome(start, new Date(start.getTime() - H), 48, "tutor")).toBe("free");
  });
});

describe("parentCanCancelOnline", () => {
  it("exactly 48h before is allowed", () => {
    expect(parentCanCancelOnline(start, new Date(start.getTime() - 48 * H), 48)).toBe(true);
  });
  it("47h59m before is not", () => {
    expect(parentCanCancelOnline(start, new Date(start.getTime() - 47 * H - 59 * 60_000), 48)).toBe(false);
  });
  it("uses the given notice hours", () => {
    expect(parentCanCancelOnline(start, new Date(start.getTime() - 25 * H), 24)).toBe(true);
  });
});

const D = 86_400_000;
describe("14-day cooling-off (Ruling R20)", () => {
  const now = new Date(start.getTime() - 20 * H); // lesson in 20h: inside the 48h notice
  it("booked 3 days ago, lesson in 20h: free (cooling-off)", () => {
    const bookedAt = new Date(now.getTime() - 3 * D);
    expect(cancellationOutcome(start, now, 48, "parent", bookedAt)).toBe("free");
    expect(cancellationDecision(start, now, 48, "parent", bookedAt)).toEqual({ outcome: "free", reason: "cooling_off" });
  });
  it("booked 20 days ago, lesson in 20h: late", () => {
    const bookedAt = new Date(now.getTime() - 20 * D);
    expect(cancellationOutcome(start, now, 48, "parent", bookedAt)).toBe("late");
    expect(cancellationDecision(start, now, 48, "parent", bookedAt)).toEqual({ outcome: "late", reason: "late" });
  });
  it("exactly 14 days after booking is still free; a minute later is late", () => {
    expect(cancellationOutcome(start, now, 48, "parent", new Date(now.getTime() - 14 * D))).toBe("free");
    expect(cancellationOutcome(start, now, 48, "parent", new Date(now.getTime() - 14 * D - 60_000))).toBe("late");
    expect(inCoolingOff(new Date(now.getTime() - 14 * D), now)).toBe(true);
  });
  it("outside the notice window the reason is the notice, whatever the booking date", () => {
    const early = new Date(start.getTime() - 72 * H);
    expect(cancellationDecision(start, early, 48, "parent", early)).toEqual({ outcome: "free", reason: "notice" });
  });
  it("without a booking date the old 48h rule applies", () => {
    expect(cancellationOutcome(start, now, 48, "parent")).toBe("late");
  });
});

describe("freeCancellationEnds", () => {
  it("is the notice deadline when the cooling-off ends earlier", () => {
    const bookedAt = new Date(start.getTime() - 30 * D);
    expect(freeCancellationEnds(start, 48, bookedAt)).toEqual(new Date(start.getTime() - 48 * H));
  });
  it("is the end of the cooling-off when that is later than the notice deadline", () => {
    const bookedAt = new Date(start.getTime() - 15 * D);
    expect(freeCancellationEnds(start, 48, bookedAt)).toEqual(new Date(bookedAt.getTime() + 14 * D));
  });
  it("is the lesson start when the whole run-up is in the cooling-off", () => {
    const bookedAt = new Date(start.getTime() - 5 * D);
    expect(freeCancellationEnds(start, 48, bookedAt)).toEqual(start);
  });
});
