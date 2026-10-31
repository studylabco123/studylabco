import { SiteShell } from "@/components/site/SiteShell";

export default function AccountLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <SiteShell>{children}</SiteShell>;
}
