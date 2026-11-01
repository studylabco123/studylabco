import type { Metadata } from "next";
import { HoursEditor } from "@/components/admin/settings/HoursEditor";
import { requireAdmin } from "@/lib/admin-guard";
import { listAvailabilityRules } from "@/lib/admin/hours-ops";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Teaching hours" };
export const dynamic = "force-dynamic";

export default async function AdminHoursPage() {
  await requireAdmin();
  const [rules, settings] = await Promise.all([listAvailabilityRules(), getSettings()]);
  return <HoursEditor rules={rules} onlineEnabled={settings.onlineEnabled} />;
}
