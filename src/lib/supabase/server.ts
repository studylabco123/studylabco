import { createServerClient as createSsrServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Cookie-session Supabase client for server components, actions and route handlers. */
export async function createServerClient() {
  const cookieStore = await cookies();
  return createSsrServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(toSet) {
          try {
            for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
          } catch {
            // Called from a Server Component, which cannot set cookies; the
            // middleware refreshes the session instead.
          }
        },
      },
    },
  );
}
