"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { decideHomeVisit as decide, markAttended as attended, markNoShow as noShow, releaseBlock as release, tutorCancel as cancel } from "@/lib/admin/lifecycle";
import { markBlockPaid as blockPaid, markPaid as paid, waiveFee as waive } from "@/lib/admin/payments";
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

export async function markBlockPaid(blockId: string, method: PaymentMethod): Promise<AdminResult> {
  await requireAdmin();
  if (!isId(blockId) || !METHODS.includes(method)) return fail("Something was missing. Please refresh and try again.");
  return done(await blockPaid(blockId, method));
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

export async function releaseBlock(blockId: string): Promise<AdminResult> {
  await requireAdmin();
  if (!isId(blockId)) return fail("Something was missing. Please refresh and try again.");
  return done(await release(blockId));
}
