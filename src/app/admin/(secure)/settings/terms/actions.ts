"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import type { AdminResult } from "@/lib/admin/result";
import { deleteTermPeriod as remove, saveTermPeriod as save } from "@/lib/admin/terms-ops";

/** Term-date actions. Each one calls requireAdmin() first (a layout guard does not protect a server action). */

function done(res: AdminResult): AdminResult {
  // Term dates decide which hours apply on a date, so refresh everything. Existing bookings are untouched.
  if (res.ok) revalidatePath("/", "layout");
  return res;
}

export async function saveTermPeriod(input: { id?: string; label: string; startsOn: string; endsOn: string }): Promise<AdminResult> {
  await requireAdmin();
  return done(await save(input));
}

export async function deleteTermPeriod(id: string): Promise<AdminResult> {
  await requireAdmin();
  return done(await remove(id));
}
