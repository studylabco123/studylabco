import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { RESULT_BUCKET, type ResultKind } from "./validation";

export interface AdminResultItem {
  id: string;
  childId: string;
  title: string;
  kind: ResultKind;
  takenOn: string;
  score: number;
  outOf: number;
  grade: string | null;
  wentWell: string;
  toImprove: string;
  publishedAt: Date | null;
  /** A short-lived link for the admin to check the file; null when there is none. */
  attachmentUrl: string | null;
}

/** All results (drafts too) for these children, newest first, keyed by child. Admin pages only. */
export async function loadResultsByChild(childIds: string[]): Promise<Map<string, AdminResultItem[]>> {
  const out = new Map<string, AdminResultItem[]>();
  if (!childIds.length) return out;
  const c = createServiceClient();
  const { data, error } = await c.from("test_results").select("*").in("child_id", childIds).order("taken_on", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load results: ${error.message}`);
  for (const r of data) {
    let attachmentUrl: string | null = null;
    if (r.attachment_path) {
      const s = await c.storage.from(RESULT_BUCKET).createSignedUrl(r.attachment_path as string, 300);
      attachmentUrl = s.error ? null : s.data.signedUrl;
    }
    const item: AdminResultItem = {
      id: r.id,
      childId: r.child_id,
      title: r.title,
      kind: r.kind,
      takenOn: r.taken_on,
      score: r.score,
      outOf: r.out_of,
      grade: r.grade,
      wentWell: r.went_well,
      toImprove: r.to_improve,
      publishedAt: r.published_at ? new Date(r.published_at) : null,
      attachmentUrl,
    };
    out.set(item.childId, [...(out.get(item.childId) ?? []), item]);
  }
  return out;
}
