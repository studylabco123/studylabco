import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { siteUrl } from "./config";
import { loadPeople, safely } from "./notifications";
import { sendEmail } from "./send";

/**
 * Tells the parent a result was published: "New results for <first name>" with a
 * link to the results page and nothing else (no scores, feedback or files).
 * Idempotent per result through email_log; a failure is logged, never thrown.
 */
export async function notifyResultPublished(resultId: string): Promise<void> {
  await safely("results published", async () => {
    const c = createServiceClient();
    const r = await c.from("test_results").select("id, child_id, published_at").eq("id", resultId).maybeSingle();
    if (r.error) throw new Error(`Could not load result: ${r.error.message}`);
    if (!r.data || !r.data.published_at) return;
    const child = await c.from("children").select("first_name, parent_id").eq("id", r.data.child_id).maybeSingle();
    if (child.error) throw new Error(`Could not load child: ${child.error.message}`);
    if (!child.data?.parent_id) return;
    const parent = (await loadPeople(c, [child.data.parent_id as string])).get(child.data.parent_id as string);
    if (!parent) return;
    await sendEmail({
      to: parent.email,
      template: "results_published",
      resultId,
      props: { parentName: parent.name, childName: child.data.first_name as string, link: `${siteUrl()}/account/children/${r.data.child_id}/results` },
    });
  });
}
