import "server-only";

/**
 * Verifies a Cloudflare Turnstile token. Returns true when TURNSTILE_SECRET_KEY
 * is unset (local dev and tests). Note: tokens are single use, so do not call
 * this for requests whose token is also passed to Supabase Auth as captchaToken
 * (Supabase verifies those itself).
 */
export async function verifyTurnstile(token: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
    });
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}
