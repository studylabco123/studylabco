import { SiteShell } from "@/components/site/SiteShell";

// Prices, contact details and group seats come from the database on every request.
export const dynamic = "force-dynamic";

export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <SiteShell>{children}</SiteShell>;
}
