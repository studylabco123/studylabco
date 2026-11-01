import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { fail, OK, unexpected, type AdminResult, type OpOptions } from "./result";

const db = () => createServiceClient();
const MAX_NOTE = 4000;
const MAX_REASON = 500;

/**
 * Approves a child for 1-to-1 and group lessons, but only once an Assessment
 * Lesson for them has been marked attended. Keeps an earlier
 * assessment_completed_at if there is one.
 */
export async function approveStudent(childId: string, opts: OpOptions = {}): Promise<AdminResult> {
  const now = (opts.now ?? new Date()).toISOString();
  const child = await db().from("children").select("id").eq("id", childId).maybeSingle();
  if (child.error) return child.error.code === "22P02" ? fail("We could not find that child.") : unexpected("load child", child.error);
  if (!child.data) return fail("We could not find that child.");

  const attended = await db()
    .from("bookings")
    .select("id")
    .eq("child_id", childId)
    .eq("kind", "assessment")
    .eq("status", "attended")
    .limit(1);
  if (attended.error) return unexpected("check assessment", attended.error);
  if (!attended.data?.length) return fail("Mark the Assessment Lesson as attended first, then approve.");

  const existing = await db().from("student_status").select("assessment_completed_at").eq("child_id", childId).maybeSingle();
  if (existing.error) return unexpected("load student status", existing.error);
  const res = await db()
    .from("student_status")
    .upsert(
      { child_id: childId, approved_at: now, assessment_completed_at: existing.data?.assessment_completed_at ?? now },
      { onConflict: "child_id" },
    );
  return res.error ? unexpected("approve student", res.error) : OK;
}

/** Blocks or unblocks a parent. The reason is private to the admin; unblocking clears it. */
export async function setBlocked(parentId: string, blocked: boolean, reason: string): Promise<AdminResult> {
  const profile = await db().from("profiles").select("id, role").eq("id", parentId).maybeSingle();
  if (profile.error) return profile.error.code === "22P02" ? fail("We could not find that family.") : unexpected("load profile", profile.error);
  if (!profile.data) return fail("We could not find that family.");
  if (profile.data.role !== "parent") return fail("Only parent accounts can be blocked.");
  const trimmed = reason.trim();
  if (trimmed.length > MAX_REASON) return fail(`Keep the reason under ${MAX_REASON} characters.`);

  const res = await db()
    .from("profiles")
    .update({ is_blocked: blocked, blocked_reason: blocked ? trimmed || null : null })
    .eq("id", parentId);
  return res.error ? unexpected("set blocked", res.error) : OK;
}

/** Adds a private tutor note to a child. */
export async function addNote(childId: string, body: string): Promise<AdminResult> {
  const text = body.trim();
  if (!text) return fail("Write a note first.");
  if (text.length > MAX_NOTE) return fail(`Keep the note under ${MAX_NOTE} characters.`);
  const res = await db().from("tutor_notes").insert({ child_id: childId, body: text });
  if (res.error) return res.error.code === "23503" || res.error.code === "22P02" ? fail("We could not find that child.") : unexpected("add note", res.error);
  return OK;
}
