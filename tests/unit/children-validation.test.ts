import { describe, expect, it } from "vitest";
import { childLevelSchema, childSchema, isUkPhone, normaliseName } from "@/lib/children/validation";

const ok = { first_name: "Alex", last_name: "P", school_year: "11", exam_board: "AQA", tier: "Higher", subjects: ["Chemistry"] };
const issues = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  Object.fromEntries((r.error?.issues ?? []).map((i) => [String(i.path[0]), i.message]));

describe("childSchema", () => {
  it("accepts a valid GCSE child with no target grade", () => {
    const r = childSchema.safeParse(ok);
    expect(r.success && r.data.target_grade).toBeNull();
    expect(r.success && r.data.school_year).toBe(11);
    expect(r.success && r.data.level).toBe("GCSE");
  });
  it("rejects unknown boards, empty subjects, bad grades", () => {
    expect(childSchema.safeParse({ ...ok, exam_board: "Pearson" }).success).toBe(false);
    expect(childSchema.safeParse({ ...ok, subjects: [] }).success).toBe(false);
    expect(childSchema.safeParse({ ...ok, subjects: ["Maths"] }).success).toBe(false);
    expect(childSchema.safeParse({ ...ok, target_grade: "10" }).success).toBe(false);
    expect(childSchema.safeParse({ ...ok, target_grade: "U" }).success).toBe(true);
  });
  it("offers Years 7 to 11 only", () => {
    for (const y of ["6", "12", "", "nine"]) {
      const r = childSchema.safeParse({ ...ok, school_year: y });
      expect(issues(r).school_year).toBe("Choose a school year from Year 7 to Year 11");
    }
    for (const y of ["7", "8", "10", "11"]) expect(childSchema.safeParse({ ...ok, school_year: y }).success).toBe(true);
  });
  it("Years 7-8 are KS3: no exam board or tier is asked or kept", () => {
    const r = childSchema.safeParse({ ...ok, school_year: "8", exam_board: "", tier: "" });
    expect(r.success && r.data).toMatchObject({ school_year: 8, level: "KS3", exam_board: null, tier: null });
    // Anything sent for board/tier is dropped for KS3, and a GCSE choice is ignored.
    const sent = childSchema.safeParse({ ...ok, school_year: "7", level: "GCSE" });
    expect(sent.success && sent.data).toMatchObject({ level: "KS3", exam_board: null, tier: null });
  });
  it("Years 10-11 are GCSE and need an exam board and tier", () => {
    const r = childSchema.safeParse({ ...ok, school_year: "10", exam_board: "", tier: "", level: "KS3" });
    expect(issues(r)).toMatchObject({ exam_board: "Choose an exam board", tier: "Choose Foundation or Higher" });
    expect(issues(r).level).toBeUndefined();
  });
  it("Year 9 must choose KS3 or GCSE", () => {
    expect(issues(childSchema.safeParse({ ...ok, school_year: "9", exam_board: "", tier: "" })).level).toBe("Choose KS3 or GCSE");
    const ks3 = childSchema.safeParse({ ...ok, school_year: "9", level: "KS3", exam_board: "", tier: "" });
    expect(ks3.success && ks3.data).toMatchObject({ school_year: 9, level: "KS3", exam_board: null, tier: null });
    const gcseMissing = childSchema.safeParse({ ...ok, school_year: "9", level: "GCSE", exam_board: "", tier: "" });
    expect(issues(gcseMissing)).toMatchObject({ exam_board: "Choose an exam board", tier: "Choose Foundation or Higher" });
    const gcse = childSchema.safeParse({ ...ok, school_year: "9", level: "GCSE" });
    expect(gcse.success && gcse.data).toMatchObject({ school_year: 9, level: "GCSE", exam_board: "AQA", tier: "Higher" });
  });
});

describe("childLevelSchema (Change level)", () => {
  it("parses the year, level, board and tier only", () => {
    const r = childLevelSchema.safeParse({ school_year: "9", level: "GCSE", exam_board: "OCR", tier: "Foundation" });
    expect(r.success && r.data).toEqual({ school_year: 9, level: "GCSE", exam_board: "OCR", tier: "Foundation" });
    const k = childLevelSchema.safeParse({ school_year: "9", level: "KS3", exam_board: "OCR", tier: "Foundation" });
    expect(k.success && k.data).toEqual({ school_year: 9, level: "KS3", exam_board: null, tier: null });
    expect(issues(childLevelSchema.safeParse({ school_year: "9" })).level).toBe("Choose KS3 or GCSE");
  });
});

describe("helpers", () => {
  it("accepts UK mobiles and landlines only", () => {
    expect(isUkPhone("07123 456789")).toBe(true);
    expect(isUkPhone("+44 7123 456789")).toBe(true);
    expect(isUkPhone("01632 960123")).toBe(true);
    expect(isUkPhone("12345")).toBe(false);
  });
  it("normalises names", () => {
    expect(normaliseName("  pAt   Parent ")).toBe("pat parent");
  });
});
