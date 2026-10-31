import { describe, expect, it } from "vitest";
import { cancellationOutcome } from "@/lib/booking/cancellation";

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
