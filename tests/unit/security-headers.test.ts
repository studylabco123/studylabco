import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

/** Review Minor 1 (Ruling R25): every page sends the security headers. */
describe("next.config headers", () => {
  it("applies the security headers to every path", async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe("/:path*");
    const h = Object.fromEntries(rules[0].headers.map((x) => [x.key, x.value]));
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Content-Security-Policy"]).toBe("frame-ancestors 'none'");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Permissions-Policy"]).toContain("camera=(self)");
    expect(h["Permissions-Policy"]).toContain("geolocation=()");
  });
});
