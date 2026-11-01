"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { fail, type AdminResult } from "@/lib/admin/result";
import {
  deleteResult as remove,
  prepareResultUpload as prepare,
  publishResult as publish,
  saveResult as save,
  unpublishResult as unpublish,
  type ResultForm,
  type UploadTicket,
} from "@/lib/admin/results-ops";

/** Test-result actions. Each one calls requireAdmin() first (see bookings/actions.ts). */

const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;
const BAD = "Something was missing. Please refresh and try again.";

function done(res: AdminResult): AdminResult {
  if (res.ok) revalidatePath("/admin", "layout");
  return res;
}

export async function prepareResultUpload(type: string, size: number, takenOn: string): Promise<UploadTicket> {
  await requireAdmin();
  return prepare(type, size, takenOn);
}

export async function saveResult(input: ResultForm): Promise<AdminResult> {
  await requireAdmin();
  return done(await save(input));
}

export async function publishResult(resultId: string): Promise<AdminResult> {
  await requireAdmin();
  if (!isId(resultId)) return fail(BAD);
  return done(await publish(resultId));
}

export async function unpublishResult(resultId: string): Promise<AdminResult> {
  await requireAdmin();
  if (!isId(resultId)) return fail(BAD);
  return done(await unpublish(resultId));
}

export async function deleteResult(resultId: string): Promise<AdminResult> {
  await requireAdmin();
  if (!isId(resultId)) return fail(BAD);
  return done(await remove(resultId));
}
