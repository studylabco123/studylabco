import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/email/config";
import { PUBLIC_PATHS } from "@/lib/public/meta";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return PUBLIC_PATHS.map((path) => ({
    url: path === "/" ? `${base}/` : `${base}${path}`,
    changeFrequency: path === "/groups" ? "daily" : "monthly",
    priority: path === "/" ? 1 : path === "/lessons" ? 0.9 : 0.6,
  }));
}
