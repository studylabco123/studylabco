import { afterEach, describe, expect, it, vi } from "vitest";
import { siteUrl } from "@/lib/email/config";
import { verifyTurnstile } from "@/lib/turnstile";

afterEach(() => vi.unstubAllEnvs());

describe("verifyTurnstile without a secret key (Ruling R21)", () => {
  it("passes in development and tests", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(await verifyTurnstile(null)).toBe(true);
    vi.stubEnv("NODE_ENV", "test");
    expect(await verifyTurnstile(null)).toBe(true);
  });
  it("fails closed in production", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("E2E_HARNESS", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await verifyTurnstile("anything")).toBe(false);
  });
  it("the e2e production build (E2E_HARNESS=1) may run without it", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_HARNESS", "1");
    expect(await verifyTurnstile(null)).toBe(true);
  });
});

describe("siteUrl (Ruling R21)", () => {
  it("strips a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://studylabco.example/");
    expect(siteUrl()).toBe("https://studylabco.example");
  });
  it("falls back to localhost outside production", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(siteUrl()).toBe("http://localhost:3000");
  });
  it("throws in production when unset", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => siteUrl()).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });
});
