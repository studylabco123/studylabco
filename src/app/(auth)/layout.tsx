import { SiteShell } from "@/components/site/SiteShell";

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <SiteShell>{children}</SiteShell>;
}
