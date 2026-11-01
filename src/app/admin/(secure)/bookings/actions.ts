"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { decideHomeVisit as decide, markAttended as attended, markNoShow as noShow, recordLateCancellation as lateCancel, tutorCancel as cancel } from "@/lib/admin/lifecycle";
import { markPaid as paid, payFromCredit as fromCredit, waiveFee as waive } from "@/lib/admin/payments";
import { fail, type AdminResult } from "@/lib/admin/result";
import type { PaymentMethod } from "@/lib/types";

/**
 * Booking actions. Each one calls requireAdmin() first: a layout guard does
 * not protect a server action, which can be invoked directly.
 */

const METHODS: readonly string[] = ["bank_transfer", "cash"];
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;

function done(res: AdminResult): AdminResult {
  if (res.ok) revalidatePath("/admin", "layout");
  return res;
}

export async function markPaid(bookingId: string, method: PaymentMethod): Promise<AdminResult> {
  await requireAdmin();
  if (!isId(bookingId) || !METHODS.includes(method)) return fail("Something was missing. Please refresh and try again.");
  return done(await paid(bookingId, method));
}

/** Pays an unpaid booking from the family's credit (Ruling R23). */
export async function payFromCredit(bookingId: string): Promise<AdminResult> {
  await requireAdmin();
  if (!isId(bookingId)) return fail("Something was missing. Please refresh and try again.");
  return done(await fromCredit(bookingId));
}

export async function markAttended(bookingId: string): Promise<AdminResult> {
  await requireAdmin();
  if (!isId(bookingId)) return fail("Something was missing. Please refresh and try again.");
  return done(await attended(bookingId));
}

export async function markNoShow(bookingId: string): Promise<AdminResult> {
  await requireAdmin();
  if (!isId(bookingId)) return fail("Something was missing. Please refresh and try again.");
  return done(await noShow(bookingId));
}

export async function waiveFee(bookingId: string): Promise<AdminResult> {
  await requireAdmin();
  if (!isId(bookingId)) return fail("Something was missing. Please refresh and try again.");
  return done(await waive(bookingId));
}

export async function tutorCancel(bookingId: string, refund: boolean): Promise<AdminResult> {
  await requireAdmin();
  if (!isId(bookingId)) return fail("Something was missing. Please refresh and try again.");
  return done(await cancel(bookingId, refund === true));
}

export async function decideHomeVisit(bookingId: string, approve: boolean): Promise<AdminResult> {
  await requireAdmin();
  if (!isId(bookingId)) return fail("Something was missing. Please refresh and try again.");
  return done(await decide(bookingId, approve === true));
}

/** Records a cancellation the parent made by phone or email: free in the cooling-off, otherwise the late cancellation fee. */
export async function recordLateCancellation(bookingId: string): Promise<AdminResult> {
  await requireAdmin();
  if (!isId(bookingId)) return fail("Something was missing. Please refresh and try again.");
  return done(await lateCancel(bookingId));
}
