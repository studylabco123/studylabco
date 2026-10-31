export const CAPTCHA_MESSAGE = "Please complete the security check again.";
export const RATE_LIMIT_MESSAGE = "Too many attempts. Please wait a few minutes and try again.";

interface AuthErrorLike {
  code?: string;
  status?: number;
}

/** Messages shared by the sign-up, login and reset actions; undefined when the caller should use its own. */
export function commonAuthMessage(error: AuthErrorLike): string | undefined {
  if (error.code === "captcha_failed") return CAPTCHA_MESSAGE;
  if (error.status === 429) return RATE_LIMIT_MESSAGE;
  return undefined;
}
