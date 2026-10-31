import { describe, expect, it } from "vitest";
import { isAllowedPostcode, normalisePostcode } from "@/lib/booking/postcode";

const D = ["BB1", "BB2"];
describe("postcode", () => {
  it.each(["bb1 1qr", "BB2 4HP", "BB11QR"])("allows %s", (pc) => {
    expect(isAllowedPostcode(pc, D)).toBe(true);
  });
  it.each(["BB10 1AA", "BB11 2AB", "BB12 7XY", "BB3 1AA", "M1 1AA", ""])("rejects %j", (pc) => {
    expect(isAllowedPostcode(pc, D)).toBe(false);
  });
  it("normalises", () => {
    expect(normalisePostcode("  bb1   1qr ")).toBe("BB1 1QR");
    expect(normalisePostcode("bb11qr")).toBe("BB1 1QR");
  });
});
