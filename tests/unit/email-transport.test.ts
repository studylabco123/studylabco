import { afterEach, describe, expect, it, vi } from "vitest";
import { emailTransport, logLine } from "@/lib/email/send";

afterEach(() => vi.unstubAllEnvs());

const env = (over: Record<string, string>) => {
  for (const k of ["NODE_ENV", "E2E_HARNESS", "VERCEL", "EMAIL_TRANSPORT", "RESEND_API_KEY", "EMAIL_FROM"]) vi.stubEnv(k, "");
  for (const [k, v] of Object.entries(over)) vi.stubEnv(k, v);
};

describe("emailTransport (review I4)", () => {
  it("outside production: EMAIL_TRANSPORT wins, else resend only with a key", () => {
    env({ NODE_ENV: "development" });
    expect(emailTransport()).toBe("log");
    env({ NODE_ENV: "development", RESEND_API_KEY: "k" });
    expect(emailTransport()).toBe("resend");
    env({ NODE_ENV: "test", EMAIL_TRANSPORT: "log", RESEND_API_KEY: "k" });
    expect(emailTransport()).toBe("log");
  });

  it("in production defaults to resend, even when EMAIL_TRANSPORT says log", () => {
    env({ NODE_ENV: "production", RESEND_API_KEY: "k", EMAIL_FROM: "Study Lab Co <bookings@example.test>" });
    expect(emailTransport()).toBe("resend");
    env({ NODE_ENV: "production", EMAIL_TRANSPORT: "log", RESEND_API_KEY: "k", EMAIL_FROM: "a@example.test" });
    expect(emailTransport()).toBe("resend");
  });

  it("in production throws a clear error when the key or sender is missing", () => {
    env({ NODE_ENV: "production", EMAIL_FROM: "a@example.test" });
    expect(() => emailTransport()).toThrow(/RESEND_API_KEY/);
    env({ NODE_ENV: "production", RESEND_API_KEY: "k" });
    expect(() => emailTransport()).toThrow(/EMAIL_FROM/);
  });

  it("the e2e production build (E2E_HARNESS=1, not on Vercel) may use the log transport", () => {
    env({ NODE_ENV: "production", E2E_HARNESS: "1", EMAIL_TRANSPORT: "log" });
    expect(emailTransport()).toBe("log");
  });

  it("E2E_HARNESS is ignored on Vercel", () => {
    env({ NODE_ENV: "production", E2E_HARNESS: "1", VERCEL: "1", EMAIL_TRANSPORT: "log" });
    expect(() => emailTransport()).toThrow(/RESEND_API_KEY/);
  });
});

describe("logLine (review I4)", () => {
  it("names only the template and the recipient's domain: no body, subject or address", () => {
    const line = logLine("pat.parent@example.test", "booking_confirmed");
    expect(JSON.parse(line)).toEqual({ email: { template: "booking_confirmed", toDomain: "example.test" } });
    expect(line).not.toContain("pat.parent");
    expect(line.endsWith("\n")).toBe(true);
  });
  it("copes with an address without a domain", () => {
    expect(JSON.parse(logLine("nobody", "contact_message")).email.toDomain).toBe("");
  });
});
