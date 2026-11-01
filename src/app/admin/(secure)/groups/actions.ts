"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import {
  cancelSession as cancel,
  createOneOff as oneOff,
  createSeries as series,
  emailGroup as email,
  endSeries as end,
  updateSeries as editSeries,
  updateSession as editSession,
  type EditInput,
  type EmailGroupResult,
  type EndSeriesResult,
  type OneOffInput,
  type SeriesInput,
} from "@/lib/admin/group-ops";
import { fail, type AdminResult, type Failure } from "@/lib/admin/result";

/** Group actions. Each one calls requireAdmin() first (a layout guard does not protect a server action). */

const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;
const BAD = "Something was missing. Please refresh and try again.";

function done<T extends { ok: boolean }>(res: T): T {
  if (res.ok) revalidatePath("/admin", "layout");
  return res;
}

export async function createSeries(input: SeriesInput): Promise<AdminResult> {
  await requireAdmin();
  if (!input || typeof input !== "object") return fail(BAD);
  return done(await series(input));
}

export async function createOneOff(input: OneOffInput): Promise<AdminResult> {
  await requireAdmin();
  if (!input || typeof input !== "object") return fail(BAD);
  return done(await oneOff(input));
}

export async function updateSeries(seriesId: string, input: EditInput): Promise<AdminResult> {
  await requireAdmin();
  if (!isId(seriesId) || !input || typeof input !== "object") return fail(BAD);
  return done(await editSeries(seriesId, input));
}

export async function updateSession(sessionId: string, input: EditInput): Promise<AdminResult> {
  await requireAdmin();
  if (!isId(sessionId) || !input || typeof input !== "object") return fail(BAD);
  return done(await editSession(sessionId, input));
}

export async function cancelSession(sessionId: string, refund: boolean): Promise<AdminResult> {
  await requireAdmin();
  if (!isId(sessionId)) return fail(BAD);
  return done(await cancel(sessionId, refund === true));
}

export async function endSeries(seriesId: string): Promise<EndSeriesResult | Failure> {
  await requireAdmin();
  if (!isId(seriesId)) return fail(BAD);
  return done(await end(seriesId));
}

export async function emailGroup(sessionId: string, subject: string, message: string): Promise<EmailGroupResult | Failure> {
  await requireAdmin();
  if (!isId(sessionId)) return fail(BAD);
  return await email(sessionId, subject, message);
}
