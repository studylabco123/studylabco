import type { Metadata } from "next";
import { SiteShell } from "@/components/site/SiteShell";
import { requireAdminAal1 } from "@/lib/admin-guard";

export const metadata: Metadata = { title: "Two-step verification", robots: { index: false, follow: false } };

/** Outside the (secure) group: this is where an admin gets aal2, so only login + admin role are required. */
export default async function MfaLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireAdminAal1();
  return <SiteShell area="admin">{children}</SiteShell>;
}
