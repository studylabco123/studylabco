import "server-only";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Admin access checks. The database (is_admin()) is the real gate: it needs
 * role = 'admin' AND an aal2 JWT. These guards give friendly redirects and stop
 * pages from rendering for the wrong person.
 *
 * EVERY admin page, layout, server action and route handler must call
 * requireAdmin() itself. A layout guard does not protect server actions or
 * route handlers, which can be invoked directly.
 *
 * Second-factor enrolment: with a verified factor already on the account,
 * GoTrue itself refuses mfa.enroll() from an aal1 (password-only) session with
 * "AAL2 required to enroll a new factor", so a stolen password cannot add an
 * attacker's authenticator. Verified against the local stack and pinned by the
 * "password alone cannot add a second authenticator" e2e test. (An admin who
 * has never enrolled can enrol from aal1; that first enrolment is the setup
 * step, so create the admin and enrol before sharing the password.)
 */

async function checkAdmin(): Promise<{ userId: string; supabase: Awaited<ReturnType<typeof createServerClient>> }> {
  const supabase = await createServerClient();
  // getUser() validates the token with Supabase; getSession() would trust the cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") redirect("/account");
  return { userId: user.id, supabase };
}

/** Logged-in admin; the 2-step code is not required yet. Only for the /admin/mfa page and its actions. */
export async function requireAdminAal1(): Promise<{ userId: string }> {
  const { userId } = await checkAdmin();
  return { userId };
}

/** Logged-in admin who has passed 2-step verification (aal2). Use in every other admin page, action and route. */
export async function requireAdmin(): Promise<{ userId: string }> {
  const { userId, supabase } = await checkAdmin();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (data?.currentLevel !== "aal2") redirect("/admin/mfa");
  return { userId };
}
