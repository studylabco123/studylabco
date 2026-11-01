import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/email/config";

/** Private areas stay out of search results (they also need a login). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/account", "/admin", "/test-harness", "/api"] },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
