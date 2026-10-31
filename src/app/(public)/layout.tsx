import { SiteShell } from "@/components/site/SiteShell";

export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <SiteShell>{children}</SiteShell>;
}
