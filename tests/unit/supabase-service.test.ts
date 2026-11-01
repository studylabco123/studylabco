import { afterEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn((...args: unknown[]) => ({ args }));
vi.mock("@supabase/supabase-js", () => ({ createClient: (...args: unknown[]) => createClient(...args) }));

describe("createServiceClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  // Next caches fetch() responses made while prerendering; a cached settings row from an
  // older schema (no pass_prices) broke the site footer ("reading 'KS3'"). Data reads are never cached.
  it("never lets Next cache a database response", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    const seen: RequestInit[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit = {}) => {
      seen.push(init);
      return new Response("{}");
    }));
    const { createServiceClient } = await import("@/lib/supabase/service");
    createServiceClient();
    const options = createClient.mock.calls[0][2] as { global?: { fetch?: typeof fetch } };
    expect(options.global?.fetch).toBeTypeOf("function");
    await options.global!.fetch!("http://127.0.0.1:54321/rest/v1/settings", { method: "GET", cache: "force-cache" });
    expect(seen[0].cache).toBe("no-store");
    expect(seen[0].method).toBe("GET");
  });
});
