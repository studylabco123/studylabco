import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Database reads must never come from Next's data cache. A page prerendered at
 * build time (for example /account/children/new) otherwise stores the settings
 * row with a one-year revalidate, and later builds keep serving that stale row
 * (one from before pass_prices existed broke the footer with "reading 'KS3'").
 */
const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: "no-store" });

/**
 * Service-role client: bypasses RLS. Server-only (the "server-only" import makes
 * the build fail if a client component ever imports this module). Never pass it
 * user-controlled table names or filters without checking the caller first.
 */
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: noStoreFetch },
  });
}
