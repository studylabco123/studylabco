import { describe, expect, it } from "vitest";
import { agreementSections } from "@/lib/agreement";
import { cancelNoticeText } from "@/app/account/bookings/CancelNotice";

const text = (percent: number) =>
  agreementSections({ onlineEnabled: false, lateFeePercent: percent })
    .flatMap((s) => s.paragraphs)
    .join(" ");

describe("agreement wording", () => {
  it("the late cancellation fee is the set share of the lesson price", () => {
    expect(text(50)).toContain("50% of the lesson price");
    expect(text(30)).toContain("30% of the lesson price");
    expect(text(50)).not.toMatch(/equal to the price/);
    expect(text(50)).not.toMatch(/\b(fine|penalty|waiver)\b/i);
  });
  it("online rules only while online is on", () => {
    const ids = (on: boolean) => agreementSections({ onlineEnabled: on, lateFeePercent: 50 }).map((s) => s.id);
    expect(ids(false)).not.toContain("online");
    expect(ids(true)).toContain("online");
  });
});

describe("cancel notice", () => {
  it("names the fee when known, else the percentage of the lesson price", () => {
    expect(cancelNoticeText("late", "1250", 50)).toBe("Booking cancelled. A late cancellation fee of £12.50 is now due.");
    expect(cancelNoticeText("late", undefined, 50)).toBe("Booking cancelled. A late cancellation fee of 50% of the lesson price is now due.");
    expect(cancelNoticeText("late", "abc", 40)).toBe("Booking cancelled. A late cancellation fee of 40% of the lesson price is now due.");
    expect(cancelNoticeText("free", undefined, 50)).toBe("Booking cancelled.");
    expect(cancelNoticeText("other", undefined, 50)).toBeNull();
  });
});
