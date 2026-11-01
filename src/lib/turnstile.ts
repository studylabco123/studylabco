import "server-only";

/**
 * Verifies a Cloudflare Turnstile token. Without TURNSTILE_SECRET_KEY it passes
 * in development and tests, but fails closed in production (Ruling R21), except
 * for the e2e production build (E2E_HARNESS=1, never set in real production). Note: tokens are single use, so do not call
 * this for requests whose token is also passed to Supabase Auth as captchaToken
 * (Supabase verifies those itself).
 */
export async function verifyTurnstile(token: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV !== "production" || process.env.E2E_HARNESS === "1") return true;
    console.error("TURNSTILE_SECRET_KEY is not set: refusing form submissions until it is");
    return false;
  }
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
