import { SiteShell } from "@/components/site/SiteShell";

// Every account page is per parent and reads live data, so none is prerendered at build time.
export const dynamic = "force-dynamic";

export default function AccountLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <SiteShell area="account">{children}</SiteShell>;
}
