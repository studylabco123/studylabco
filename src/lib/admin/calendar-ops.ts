import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { addDays, londonDateTime, parseTimeMinutes } from "@/lib/time";
import { fail, OK, unexpected, type AdminResult } from "./result";

/** Write side of the admin calendar: closing days and blocking time. The caller has passed requireAdmin(). */

const db = () => createServiceClient();

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_REASON = 200;

/** True for a real calendar date such as 2026-12-25 (not 2026-02-31). */
export function isRealDate(date: unknown): date is string {
  if (typeof date !== "string" || !DATE.test(date)) return false;
  return new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
}

function isTime(t: unknown): t is string {
  if (typeof t !== "string") return false;
  try {
    return parseTimeMinutes(t) < 24 * 60;
  } catch {
    return false;
  }
}

/**
 * An instant from the admin form. 'YYYY-MM-DDTHH:mm' is London wall-clock
 * time (what a datetime-local input gives); a string with Z or an offset is
 * taken as the exact instant.
 */
export function parseInstant(text: unknown): Date | null {
  if (typeof text !== "string") return null;
  const local = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})$/.exec(text.trim());
  if (local) return isRealDate(local[1]) && isTime(local[2]) ? londonDateTime(local[1], local[2]) : null;
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(text.trim())) return null;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

const BAD_DATE = fail("Choose a valid date.");

function dayBounds(date: string): { start: Date; end: Date } {
  return { start: londonDateTime(date, "00:00"), end: londonDateTime(addDays(date, 1), "00:00") };
}

/** Closes a whole London day: no parent can book it, and group sessions are not generated for it. */
export async function closeDay(date: string): Promise<AdminResult> {
  if (!isRealDate(date)) return BAD_DATE;
  const { start, end } = dayBounds(date);
  const existing = await db()
    .from("blocked_times")
    .select("id")
    .eq("starts_at", start.toISOString())
    .eq("ends_at", end.toISOString())
    .limit(1);
  if (existing.error) return unexpected("check closed day", existing.error);
  if (existing.data?.length) return OK; // already closed
  const ins = await db()
    .from("blocked_times")
    .insert({ starts_at: start.toISOString(), ends_at: end.toISOString(), reason: "Closed", is_default: false });
  return ins.error ? unexpected("close day", ins.error) : OK;
}

/**
 * Reopens a London day by deleting its whole-day block(s), including default
 * ones such as Christmas Day. A day that is only covered by a longer block is
 * refused: remove that block instead.
 */
export async function reopenDay(date: string): Promise<AdminResult> {
  if (!isRealDate(date)) return BAD_DATE;
  const { start, end } = dayBounds(date);
  const del = await db()
    .from("blocked_times")
    .delete()
    .eq("starts_at", start.toISOString())
    .eq("ends_at", end.toISOString())
    .select("id");
  if (del.error) return unexpected("reopen day", del.error);
  if (del.data?.length) return OK;

  const covering = await db()
    .from("blocked_times")
    .select("id")
    .lte("starts_at", start.toISOString())
    .gte("ends_at", end.toISOString())
    .limit(1);
  if (covering.error) return unexpected("check covering block", covering.error);
  if (covering.data?.length) return fail("This day is part of a longer block. Remove that block to reopen it.");
  return fail("This day is not closed.");
}

/** Blocks one stretch of time (a single instant range). */
export async function blockRange(startsAt: unknown, endsAt: unknown, reason: unknown): Promise<AdminResult> {
  const start = parseInstant(startsAt);
  const end = parseInstant(endsAt);
  if (!start || !end) return fail("Choose a start and an end time.");
  if (end.getTime() <= start.getTime()) return fail("The end must be after the start.");
  const why = typeof reason === "string" ? reason.trim() : "";
  if (why.length > MAX_REASON) return fail(`The reason is too long (${MAX_REASON} characters at most).`);
  const ins = await db().from("blocked_times").insert({ starts_at: start.toISOString(), ends_at: end.toISOString(), reason: why });
  return ins.error ? unexpected("block range", ins.error) : OK;
}

/** Blocks a weekly slot (London wall-clock), from `validFrom` through `validTo` (open when empty). */
export async function blockRepeating(
  weekday: unknown,
  start: unknown,
  end: unknown,
  validFrom: unknown,
  validTo: unknown,
  reason: unknown,
): Promise<AdminResult> {
  if (typeof weekday !== "number" || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) return fail("Choose a day of the week.");
  if (!isTime(start) || !isTime(end)) return fail("Choose a start and an end time.");
  if (parseTimeMinutes(end) <= parseTimeMinutes(start)) return fail("The end must be after the start.");
  if (!isRealDate(validFrom)) return fail("Choose the date it starts from.");
  const to = validTo === undefined || validTo === null || validTo === "" ? null : validTo;
  if (to !== null && (!isRealDate(to) || to < validFrom)) return fail("The end date must be on or after the start date.");
  const why = typeof reason === "string" ? reason.trim() : "";
  if (why.length > MAX_REASON) return fail(`The reason is too long (${MAX_REASON} characters at most).`);
  const ins = await db()
    .from("blocked_rules")
    .insert({ weekday, start_time: start, end_time: end, valid_from: validFrom, valid_to: to, reason: why });
  return ins.error ? unexpected("block repeating", ins.error) : OK;
}

/** Removes a one-off block or a repeating block by id. */
export async function unblock(id: unknown): Promise<AdminResult> {
  if (typeof id !== "string" || id.length === 0 || id.length > 64) return fail("We could not find that block.");
  for (const table of ["blocked_times", "blocked_rules"] as const) {
    const del = await db().from(table).delete().eq("id", id).select("id");
    if (del.error) {
      if (del.error.code === "22P02") return fail("We could not find that block.");
      return unexpected("unblock", del.error);
    }
    if (del.data?.length) return OK;
  }
  return fail("We could not find that block.");
}
