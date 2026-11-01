import "server-only";
import { randomUUID } from "node:crypto";
import { notifyResultPublished } from "@/lib/email/results-notifications";
import { checkAttachment, parseResult, RESULT_BUCKET, RESULT_PATH } from "@/lib/results/validation";
import { createServiceClient } from "@/lib/supabase/service";
import { londonDateOf } from "@/lib/time";
import { fail, OK, unexpected, type AdminResult, type Failure, type OpOptions } from "./result";

const db = () => createServiceClient();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = fail("We could not find that result.");

export interface ResultForm {
  /** Present when editing. */
  id?: unknown;
  childId: unknown;
  title: unknown;
  kind: unknown;
  takenOn: unknown;
  score: unknown;
  outOf: unknown;
  grade: unknown;
  wentWell: unknown;
  toImprove: unknown;
  /**
   * Attachment from prepareResultUpload once the browser has uploaded it.
   * undefined/"" = leave as is; null = remove the current attachment; a path = replace it.
   */
  attachmentPath?: unknown;
}

export type UploadTicket = { ok: true; path: string; token: string } | Failure;

/**
 * Step 1 of an attachment: checks the declared type and size and returns a
 * one-off signed upload token for results/YYYY/<uuid>.<ext>, so the file goes
 * from the browser straight to private storage.
 */
export async function prepareResultUpload(type: unknown, size: unknown, takenOn: unknown): Promise<UploadTicket> {
  const checked = checkAttachment({ size: typeof size === "number" ? size : 0, type: typeof type === "string" ? type : "" });
  if (!checked.ok) return fail(checked.message);
  const year = typeof takenOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(takenOn) ? takenOn.slice(0, 4) : String(new Date().getUTCFullYear());
  const path = `results/${year}/${randomUUID()}.${checked.value.ext}`;
  const res = await db().storage.from(RESULT_BUCKET).createSignedUploadUrl(path);
  if (res.error) return unexpected("prepare result upload", res.error);
  return { ok: true, path, token: res.data.token };
}

/** Removes an uploaded object nobody refers to (a refused save leaves no orphan). Never touches a path a result uses. */
async function dropIfUnused(path: unknown): Promise<void> {
  if (typeof path !== "string" || !RESULT_PATH.test(path)) return;
  const used = await db().from("test_results").select("id").eq("attachment_path", path).limit(1);
  if (used.error || used.data.length) return;
  await db().storage.from(RESULT_BUCKET).remove([path]);
}

/**
 * Creates a draft result, or edits one (id given). A new attachment must be an
 * object the browser already uploaded to a results/YYYY/<uuid>.<ext> key; its
 * size and type are read back from storage, and no other result may use it.
 * Replacing or removing an attachment deletes the old object. Editing never
 * changes whether the result is published.
 */
export async function saveResult(form: ResultForm, opts: OpOptions = {}): Promise<AdminResult> {
  const newPath = typeof form.attachmentPath === "string" && form.attachmentPath !== "" ? form.attachmentPath : null;
  const refuse = async (message: string): Promise<AdminResult> => {
    await dropIfUnused(newPath);
    return fail(message);
  };

  const parsed = parseResult(form, londonDateOf(opts.now ?? new Date()));
  if (!parsed.ok) return refuse(parsed.message);
  const v = parsed.value;

  let existing: { id: string; child_id: string; attachment_path: string | null } | null = null;
  if (form.id !== undefined && form.id !== null && form.id !== "") {
    if (typeof form.id !== "string" || !UUID.test(form.id)) return refuse(NOT_FOUND.message);
    const r = await db().from("test_results").select("id, child_id, attachment_path").eq("id", form.id).maybeSingle();
    if (r.error) return unexpected("load result", r.error);
    if (!r.data) return refuse(NOT_FOUND.message);
    existing = r.data;
  } else {
    if (typeof form.childId !== "string" || !UUID.test(form.childId)) return refuse("Choose a child.");
    const k = await db().from("children").select("id").eq("id", form.childId).maybeSingle();
    if (k.error) return unexpected("load child", k.error);
    if (!k.data) return refuse("We could not find that child.");
  }

  if (newPath) {
    if (!RESULT_PATH.test(newPath)) return fail("That file could not be used. Please upload it again.");
    const info = await db().storage.from(RESULT_BUCKET).info(newPath);
    if (info.error || !info.data) return fail("The file did not upload. Please try again.");
    const checked = checkAttachment({ size: info.data.size ?? 0, type: info.data.contentType ?? "" });
    if (!checked.ok) return refuse(checked.message);
    const taken = await db().from("test_results").select("id").eq("attachment_path", newPath).limit(1);
    if (taken.error) return unexpected("check attachment", taken.error);
    if (taken.data.length) return fail("That file is already attached to a result.");
  }

  const fields = {
    title: v.title,
    kind: v.kind,
    taken_on: v.takenOn,
    score: v.score,
    out_of: v.outOf,
    grade: v.grade,
    went_well: v.wentWell,
    to_improve: v.toImprove,
  };
  if (existing) {
    const removing = form.attachmentPath === null;
    const patch: Record<string, unknown> = { ...fields, updated_at: new Date().toISOString() };
    if (newPath) patch.attachment_path = newPath;
    else if (removing) patch.attachment_path = null;
    const upd = await db().from("test_results").update(patch).eq("id", existing.id);
    if (upd.error) {
      await dropIfUnused(newPath);
      return unexpected("update result", upd.error);
    }
    if (existing.attachment_path && (newPath || removing) && existing.attachment_path !== newPath) {
      await db().storage.from(RESULT_BUCKET).remove([existing.attachment_path]);
    }
    return OK;
  }

  const ins = await db().from("test_results").insert({ ...fields, child_id: form.childId as string, attachment_path: newPath });
  if (ins.error) {
    await dropIfUnused(newPath);
    return unexpected("add result", ins.error);
  }
  return OK;
}

/**
 * Makes a result visible to the parent and emails them (once per publication).
 * Calling it on an already published result changes nothing and, because the
 * email is idempotent per result, sends nothing again; if the first email
 * failed this retries it. Unpublish clears the email record, so unpublishing
 * and publishing again does notify the parent again.
 */
export async function publishResult(resultId: string, opts: OpOptions = {}): Promise<AdminResult> {
  if (!UUID.test(resultId)) return NOT_FOUND;
  const r = await db().from("test_results").select("id, published_at").eq("id", resultId).maybeSingle();
  if (r.error) return unexpected("load result", r.error);
  if (!r.data) return NOT_FOUND;
  if (!r.data.published_at) {
    const upd = await db().from("test_results").update({ published_at: (opts.now ?? new Date()).toISOString() }).eq("id", resultId).is("published_at", null);
    if (upd.error) return unexpected("publish result", upd.error);
  }
  await notifyResultPublished(resultId);
  return OK;
}

/** Hides a result from the parent again (back to a draft) and forgets that the parent was told. */
export async function unpublishResult(resultId: string): Promise<AdminResult> {
  if (!UUID.test(resultId)) return NOT_FOUND;
  const upd = await db().from("test_results").update({ published_at: null }).eq("id", resultId).select("id");
  if (upd.error) return unexpected("unpublish result", upd.error);
  if (!upd.data.length) return NOT_FOUND;
  const log = await db().from("email_log").delete().eq("result_id", resultId).eq("template", "results_published");
  if (log.error) return unexpected("clear result email", log.error);
  return OK;
}

/** Deletes a result and its attachment object. */
export async function deleteResult(resultId: string): Promise<AdminResult> {
  if (!UUID.test(resultId)) return NOT_FOUND;
  const r = await db().from("test_results").select("id, attachment_path").eq("id", resultId).maybeSingle();
  if (r.error) return unexpected("load result", r.error);
  if (!r.data) return NOT_FOUND;
  const del = await db().from("test_results").delete().eq("id", resultId);
  if (del.error) return unexpected("delete result", del.error);
  if (r.data.attachment_path) await db().storage.from(RESULT_BUCKET).remove([r.data.attachment_path as string]);
  return OK;
}
