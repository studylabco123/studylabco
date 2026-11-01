import { describe, expect, it } from "vitest";
import { childFeedLabel, childLevelLine } from "@/lib/children/summary";

describe("childLevelLine", () => {
  it("KS3 children show the key stage instead of an exam board", () => {
    expect(childLevelLine({ schoolYear: 8, level: "KS3", examBoard: null, tier: null })).toBe("Year 8, KS3");
    expect(childLevelLine({ schoolYear: 9, level: "KS3", examBoard: null, tier: null })).toBe("Year 9, KS3");
  });
  it("GCSE children show the level, board and tier", () => {
    expect(childLevelLine({ schoolYear: 11, level: "GCSE", examBoard: "AQA", tier: "Higher" })).toBe("Year 11, GCSE, AQA Higher");
    expect(childLevelLine({ schoolYear: 9, level: "GCSE", examBoard: "OCR", tier: "Foundation" })).toBe("Year 9, GCSE, OCR Foundation");
  });
  it("never prints null when a GCSE board is missing", () => {
    expect(childLevelLine({ schoolYear: 10, level: "GCSE", examBoard: null, tier: null })).toBe("Year 10, GCSE");
  });
});

describe("childFeedLabel", () => {
  it("uses the board for GCSE and KS3 otherwise", () => {
    expect(childFeedLabel({ schoolYear: 11, level: "GCSE", examBoard: "AQA" })).toBe("Y11, AQA");
    expect(childFeedLabel({ schoolYear: 8, level: "KS3", examBoard: null })).toBe("Y8, KS3");
    expect(childFeedLabel({ schoolYear: 10, level: "GCSE", examBoard: null })).toBe("Y10, GCSE");
  });
});
