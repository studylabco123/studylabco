import type { Metadata } from "next";
import { FeedLink } from "@/components/admin/settings/FeedLink";
import { SettingsForm } from "@/components/admin/settings/SettingsForm";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { requireAdmin } from "@/lib/admin-guard";
import { settingsToFormInput } from "@/lib/admin/settings-validation";
import { siteUrl } from "@/lib/email/config";
import { getPrivateSettings, getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await requireAdmin();
  const [settings, priv] = await Promise.all([getSettings(), getPrivateSettings()]);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-h1">Settings</h1>
      <SettingsForm initial={settingsToFormInput(settings, priv)} />

      <Card as="section" aria-labelledby="feed-h" className="flex flex-col gap-4 p-4 sm:p-6">
        <h2 id="feed-h" className="text-h2">
          Calendar link
        </h2>
        <FeedLink siteUrl={siteUrl()} initialToken={priv.calendarFeedToken} />
      </Card>

      <Card as="section" aria-labelledby="backup-h" className="flex flex-col gap-4 p-4 sm:p-6">
        <h2 id="backup-h" className="text-h2">
          Backup
        </h2>
        <p>Download everything (families, bookings, money and settings) as one file. Keep it somewhere safe: it contains personal details.</p>
        {/* A plain link, not next/link: the response is a file download. */}
        <a href="/api/admin/backup" download className={buttonClasses({ variant: "secondary", className: "self-start" })}>
          Download backup
        </a>
      </Card>
    </div>
  );
}
