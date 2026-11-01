import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Lexend } from "next/font/google";
import { ToastProvider } from "@/components/ui/Toast";
import { OG_IMAGE } from "@/lib/public/meta";
import "./globals.css";

// Self-hosted at build time by next/font: no requests to Google at runtime.
const lexend = Lexend({ subsets: ["latin"], variable: "--font-lexend", display: "swap" });
const atkinson = Atkinson_Hyperlegible_Next({
  subsets: ["latin"],
  variable: "--font-atkinson",
  display: "swap",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: { default: "Study Lab Co | GCSE Science tuition in Blackburn", template: "%s | Study Lab Co" },
  description:
    "GCSE Science tuition in Blackburn from a qualified teacher (QTS), enhanced DBS checked, for all exam boards.",
  applicationName: "Study Lab Co",
  appleWebApp: { title: "Study Lab Co", capable: true, statusBarStyle: "default" },
  formatDetection: { telephone: false },
  openGraph: { type: "website", locale: "en_GB", siteName: "Study Lab Co", images: [OG_IMAGE] },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-GB" className={`${lexend.variable} ${atkinson.variable}`}>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
