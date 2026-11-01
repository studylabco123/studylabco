import { FALLBACK_EMAIL, SITE_NAME } from "@/lib/site";

export { SITE_NAME };

export function businessInbox(): string {
  return process.env.BUSINESS_INBOX || FALLBACK_EMAIL;
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}
