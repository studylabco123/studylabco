import type { Metadata } from "next";
import { TermsEditor } from "@/components/admin/settings/TermsEditor";
import { requireAdmin } from "@/lib/admin-guard";
import { listTermPeriods } from "@/lib/admin/terms-ops";

export const metadata: Metadata = { title: "Term dates" };
export const dynamic = "force-dynamic";

export default async function AdminTermsPage() {
  await requireAdmin();
  return <TermsEditor terms={await listTermPeriods()} />;
}
