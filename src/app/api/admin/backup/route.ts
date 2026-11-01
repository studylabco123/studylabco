import { requireAdmin } from "@/lib/admin-guard";
import { backupFilename, buildBackup } from "@/lib/admin/backup";

export const dynamic = "force-dynamic";

/** Download of every public table as JSON. Admin (with 2-step verification) only. */
export async function GET() {
  await requireAdmin();
  const now = new Date();
  const backup = await buildBackup(now);
  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${backupFilename(now)}"`,
      "Cache-Control": "no-store",
    },
  });
}
