"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { deleteAvailabilityRule as remove, saveAvailabilityRule as save, type AvailabilityRuleInput } from "@/lib/admin/hours-ops";
import type { AdminResult } from "@/lib/admin/result";

/** Teaching-hours actions. Each one calls requireAdmin() first (a layout guard does not protect a server action). */

function done(res: AdminResult): AdminResult {
  // Hours decide which slots parents are offered, so refresh everything. Existing bookings are untouched.
  if (res.ok) revalidatePath("/", "layout");
  return res;
}

export async function saveAvailabilityRule(input: AvailabilityRuleInput): Promise<AdminResult> {
  await requireAdmin();
  return done(await save(input));
}

export async function deleteAvailabilityRule(id: string): Promise<AdminResult> {
  await requireAdmin();
  return done(await remove(id));
}
