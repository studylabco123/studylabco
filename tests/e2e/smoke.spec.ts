import { expect, test } from "@playwright/test";

test("home returns 200 with lang en-GB", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
});

test("pages send the security headers (review Minor 1)", async ({ request }) => {
  for (const path of ["/", "/login", "/terms"]) {
    const res = await request.get(path, { maxRedirects: 0 });
    const h = res.headers();
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["content-security-policy"]).toBe("frame-ancestors 'none'");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"]).toContain("camera=(self)");
  }
});
