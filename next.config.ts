import type { NextConfig } from "next";

/**
 * Security headers on every response (review Minor 1, Ruling R25).
 * - No framing (clickjacking of admin and parent actions): CSP frame-ancestors
 *   plus X-Frame-Options for older browsers. Turnstile is unaffected: it frames
 *   Cloudflare's page inside ours, not ours inside another.
 * - Camera only for this site (receipt photos in admin Money); the other
 *   powerful features are off.
 */
const SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
