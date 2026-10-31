import { createBrowserClient as createSsrBrowserClient } from "@supabase/ssr";

/** Supabase client for client components (anon key; RLS applies). */
export function createBrowserClient() {
  return createSsrBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
