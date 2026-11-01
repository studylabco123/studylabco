import { describe, expect, it } from "vitest";
import { assessmentLevel, levelFor } from "@/lib/booking/level";

describe("levelFor", () => {
  it("Years 7 and 8 are KS3", () => {
    expect(levelFor(7)).toBe("KS3");
    expect(levelFor(8)).toBe("KS3");
  });
  it("Year 9 uses the parent's choice, defaulting to GCSE", () => {
    expect(levelFor(9, "KS3")).toBe("KS3");
    expect(levelFor(9, "GCSE")).toBe("GCSE");
    expect(levelFor(9)).toBe("GCSE");
    expect(levelFor(9, null)).toBe("GCSE");
  });
  it("Years 10 and 11 are GCSE", () => {
    expect(levelFor(10)).toBe("GCSE");
    expect(levelFor(11)).toBe("GCSE");
  });
});

describe("assessmentLevel", () => {
  it("Year 9 always sits the GCSE assessment", () => {
    expect(assessmentLevel(9, "KS3")).toBe("GCSE");
    expect(assessmentLevel(9, "GCSE")).toBe("GCSE");
  });
  it("other years follow the child's level", () => {
    expect(assessmentLevel(8, "KS3")).toBe("KS3");
    expect(assessmentLevel(10, "GCSE")).toBe("GCSE");
  });
});
