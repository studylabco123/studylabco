import { NextResponse, type NextRequest } from "next/server";
import { emailOtpType, explicitNextPath, safeNextPath } from "@/lib/auth/validation";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Email links (confirm sign-up, reset password) land here and become a session.
 * - token_hash + type: the site's email templates (supabase/templates) use these
 *   links, which work on any device (review I5). Only the types the site sends
 *   are accepted (signup, email, recovery); anything else is refused.
 * - code: the PKCE fallback (Supabase's default templates); it only works in the
 *   browser that asked for the email.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const rawType = searchParams.get("type");
  const type = emailOtpType(rawType);
  // A reset link always continues to the new-password form.
  const next =
    type === "recovery" ? (explicitNextPath(searchParams.get("next")) ?? "/reset?mode=update") : safeNextPath(searchParams.get("next"));

  const supabase = await createServerClient();
  let ok = false;
  if (tokenHash) {
    if (type) ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }
  if (!ok) {
    const failed = type === "recovery" ? "/reset?notice=link-failed" : "/login?notice=confirm-failed";
    return NextResponse.redirect(new URL(failed, origin));
  }
  return NextResponse.redirect(new URL(next, origin));
}
