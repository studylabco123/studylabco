import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { RESULT_BUCKET } from "./validation";

const FIVE_MINUTES = 5 * 60;

/**
 * A 5-minute signed link to a result's attachment, or null. Parents never reach
 * storage directly: this checks (service client) that the result belongs to a
 * child of `parentId` (from the session) and is published before signing.
 */
export async function signedAttachmentUrl(resultId: string, parentId: string): Promise<string | null> {
  const c = createServiceClient();
  const r = await c
    .from("test_results")
    .select("attachment_path, published_at, children!inner(parent_id)")
    .eq("id", resultId)
    .maybeSingle();
  if (r.error || !r.data || !r.data.attachment_path || !r.data.published_at) return null;
  const owner = (Array.isArray(r.data.children) ? r.data.children[0] : r.data.children) as { parent_id: string } | undefined;
  if (owner?.parent_id !== parentId) return null;
  const s = await c.storage.from(RESULT_BUCKET).createSignedUrl(r.data.attachment_path as string, FIVE_MINUTES);
  return s.error ? null : s.data.signedUrl;
}
