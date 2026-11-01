import { SiteShell } from "@/components/site/SiteShell";

// The header and footer show contact details from settings.
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <SiteShell>{children}</SiteShell>;
}
