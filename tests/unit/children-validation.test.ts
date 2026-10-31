import { describe, expect, it } from "vitest";
import { childSchema, isUkPhone, normaliseName } from "@/lib/children/validation";

const ok = { first_name: "Alex", last_name: "P", school_year: "11", exam_board: "AQA", tier: "Higher", subjects: ["Chemistry"] };

describe("childSchema", () => {
  it("accepts a valid child with no target grade", () => {
    const r = childSchema.safeParse(ok);
    expect(r.success && r.data.target_grade).toBeNull();
    expect(r.success && r.data.school_year).toBe(11);
  });
  it("rejects Year 9, unknown boards, empty subjects, bad grades", () => {
    expect(childSchema.safeParse({ ...ok, school_year: "9" }).success).toBe(false);
    expect(childSchema.safeParse({ ...ok, exam_board: "Pearson" }).success).toBe(false);
    expect(childSchema.safeParse({ ...ok, subjects: [] }).success).toBe(false);
    expect(childSchema.safeParse({ ...ok, subjects: ["Maths"] }).success).toBe(false);
    expect(childSchema.safeParse({ ...ok, target_grade: "10" }).success).toBe(false);
    expect(childSchema.safeParse({ ...ok, target_grade: "U" }).success).toBe(true);
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
