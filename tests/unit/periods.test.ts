import { describe, expect, test } from "vitest";
import { periodFor } from "@/lib/calendar/periods";
import { TERMS } from "./fixtures";

describe("periodFor", () => {
  test("term day", () => expect(periodFor("2026-11-03", TERMS)).toBe("term"));
  test("Christmas break is holiday", () => expect(periodFor("2026-12-21", TERMS)).toBe("holiday"));
  test("gap between spring segments is holiday", () =>
    expect(periodFor("2027-03-09", TERMS)).toBe("holiday"));
  test("inset day inside first term is term", () =>
    expect(periodFor("2026-09-01", TERMS)).toBe("term"));
  test("segment end is inclusive", () => expect(periodFor("2026-12-18", TERMS)).toBe("term"));
});
