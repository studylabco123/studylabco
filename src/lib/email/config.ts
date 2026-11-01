import { FALLBACK_EMAIL, SITE_NAME } from "@/lib/site";

export { SITE_NAME };

export function businessInbox(): string {
  return process.env.BUSINESS_INBOX || FALLBACK_EMAIL;
}

/**
 * The public site address, without a trailing slash. Production must set
 * NEXT_PUBLIC_SITE_URL (links in emails, metadata and the sitemap use it), so a
 * missing value fails the build or startup there (Ruling R21).
 */
export function siteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  if (!url) {
    if (process.env.NODE_ENV === "production") throw new Error("NEXT_PUBLIC_SITE_URL must be set in production");
    return "http://localhost:3000";
  }
  return url.replace(/\/$/, "");
}
