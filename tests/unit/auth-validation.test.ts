import { describe, expect, test } from "vitest";
import { explicitNextPath, loginDestination, normalisePhone, safeNextPath, signupSchema } from "@/lib/auth/validation";

const valid = {
  full_name: "Sam Parent",
  email: "sam@example.com",
  phone: "07123 456789",
  password: "correct-horse-battery",
  age_guardian: "on",
  terms: "on",
};

describe("signupSchema", () => {
  test("accepts valid input and strips phone spaces", () => {
    const r = signupSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.phone).toBe("07123456789");
      expect(r.data.marketing).toBe(false);
    }
  });
  test.each(["12345", "0812345678", "+4471234567", "07123 45678", "+44 7123 456789x"])("rejects phone %s", (phone) => {
    expect(signupSchema.safeParse({ ...valid, phone }).success).toBe(false);
  });
  test.each(["+44 7123 456789", "07123456789"])("accepts phone %s", (phone) => {
    expect(signupSchema.safeParse({ ...valid, phone }).success).toBe(true);
  });
  test("password needs 10 characters", () => {
    expect(signupSchema.safeParse({ ...valid, password: "123456789" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...valid, password: "1234567890" }).success).toBe(true);
  });
  test("both mandatory consents are required, marketing optional", () => {
    const noAge: Record<string, string> = { ...valid };
    delete noAge.age_guardian;
    const noTerms: Record<string, string> = { ...valid };
    delete noTerms.terms;
    expect(signupSchema.safeParse(noAge).success).toBe(false);
    expect(signupSchema.safeParse(noTerms).success).toBe(false);
    const r = signupSchema.safeParse({ ...valid, marketing: "on" });
    expect(r.success && r.data.marketing).toBe(true);
  });
  test("requires name and a valid email", () => {
    expect(signupSchema.safeParse({ ...valid, full_name: " " }).success).toBe(false);
    expect(signupSchema.safeParse({ ...valid, email: "nope" }).success).toBe(false);
  });
});

describe("normalisePhone", () => {
  test("removes all whitespace", () => expect(normalisePhone(" 07 123 456 789 ")).toBe("07123456789"));
});

describe("safeNextPath", () => {
  test.each([
    ["/account", "/account"],
    ["/account/bookings?x=1", "/account/bookings?x=1"],
    ["https://evil.com", "/account"],
    ["//evil.com", "/account"],
    ["/\\evil.com", "/account"],
    ["account", "/account"],
    [null, "/account"],
    [undefined, "/account"],
    ["/%2F%2Fevil", "/%2F%2Fevil"],
    ["/a\nb", "/account"],
  ])("%s -> %s", (input, out) => {
    expect(safeNextPath(input as string | null | undefined)).toBe(out);
  });
});

describe("loginDestination", () => {
  test("an admin with no explicit next goes to /admin; a parent to /account", () => {
    expect(loginDestination("", "admin")).toBe("/admin");
    expect(loginDestination(null, "admin")).toBe("/admin");
    expect(loginDestination("", "parent")).toBe("/account");
    expect(loginDestination("", null)).toBe("/account");
  });
  test("an explicit safe next is honoured for everyone", () => {
    expect(loginDestination("/account/bookings", "admin")).toBe("/account/bookings");
    expect(loginDestination("/admin/families", "admin")).toBe("/admin/families");
    expect(loginDestination("/account/book", "parent")).toBe("/account/book");
  });
  test("an unsafe next counts as not given", () => {
    expect(loginDestination("//evil.com", "admin")).toBe("/admin");
    expect(loginDestination("https://evil.com", "parent")).toBe("/account");
  });
  test("explicitNextPath only returns valid given paths", () => {
    expect(explicitNextPath("/admin")).toBe("/admin");
    expect(explicitNextPath("")).toBeNull();
    expect(explicitNextPath("//x")).toBeNull();
    expect(explicitNextPath(undefined)).toBeNull();
  });
});
