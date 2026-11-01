"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { blockRange as range, blockRepeating as repeating, closeDay as close, reopenDay as reopen, unblock as remove } from "@/lib/admin/calendar-ops";
import type { AdminResult } from "@/lib/admin/result";

/** Calendar actions. Each one calls requireAdmin() first (a layout guard does not protect a server action). */

function done(res: AdminResult): AdminResult {
  if (res.ok) revalidatePath("/admin", "layout");
  return res;
}

export async function blockRange(startsAt: string, endsAt: string, reason: string): Promise<AdminResult> {
  await requireAdmin();
  return done(await range(startsAt, endsAt, reason));
}

export async function blockRepeating(
  weekday: number,
  start: string,
  end: string,
  validFrom: string,
  validTo: string | undefined,
  reason: string,
): Promise<AdminResult> {
  await requireAdmin();
  return done(await repeating(weekday, start, end, validFrom, validTo, reason));
}

export async function closeDay(date: string): Promise<AdminResult> {
  await requireAdmin();
  return done(await close(date));
}

export async function reopenDay(date: string): Promise<AdminResult> {
  await requireAdmin();
  return done(await reopen(date));
}

export async function unblock(id: string): Promise<AdminResult> {
  await requireAdmin();
  return done(await remove(id));
}
