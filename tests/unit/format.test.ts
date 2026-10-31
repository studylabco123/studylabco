import { describe, expect, test } from "vitest";
import { formatLondon, formatPence } from "@/lib/format";

describe("formatPence", () => {
  test("whole pounds have no decimals", () => {
    expect(formatPence(2500)).toBe("£25");
  });
  test("fractional pounds show pence", () => {
    expect(formatPence(1250)).toBe("£12.50");
  });
});

describe("formatLondon", () => {
  test("formats in London time across BST", () => {
    expect(formatLondon(new Date("2026-07-01T16:00:00Z"), "HH:mm")).toBe("17:00");
    expect(formatLondon(new Date("2026-12-01T16:00:00Z"), "HH:mm")).toBe("16:00");
  });
});
