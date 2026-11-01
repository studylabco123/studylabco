import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";

/** Open Graph image: the logo as a PNG (social sites don't render SVG). */
export const OG_IMAGE = { url: "/icons/icon-512.png", width: 512, height: 512, alt: "Study Lab Co Tutoring logo" };

/** Title, description, canonical path and Open Graph tags for one public page. */
export function pageMetadata(title: string | null, description: string, path: string): Metadata {
  const ogTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} | GCSE Science tuition in Blackburn`;
  return {
    ...(title ? { title } : {}),
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: "en_GB",
      siteName: SITE_NAME,
      title: ogTitle,
      description,
      url: path,
      images: [OG_IMAGE],
    },
    twitter: { card: "summary", title: ogTitle, description, images: [OG_IMAGE.url] },
  };
}

/** Every page the sitemap lists (never /account, /admin, /test-harness or /api). */
export const PUBLIC_PATHS = [
  "/",
  "/about",
  "/lessons",
  "/groups",
  "/faq",
  "/contact",
  "/terms",
  "/refunds",
  "/privacy",
  "/cookies",
  "/safeguarding",
  "/accessibility",
] as const;

/** Policy pages' shared "last updated" date (matches POLICY_VERSION). */
export const LEGAL_UPDATED = "1 November 2026";
