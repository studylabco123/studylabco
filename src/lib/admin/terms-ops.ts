import "server-only";
import { isRealDate } from "@/lib/admin/calendar-ops";
import { mapTermPeriod, type TermPeriodRow } from "@/lib/supabase/mappers";
import { createServiceClient } from "@/lib/supabase/service";
import type { TermPeriod } from "@/lib/types";
import { fail, OK, unexpected, type AdminResult } from "./result";

/** Write side of the term dates. The caller has passed requireAdmin(). */

const db = () => createServiceClient();

const MAX_LABEL = 60;
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export async function listTermPeriods(): Promise<TermPeriod[]> {
  const { data, error } = await db().from("term_periods").select("id, label, starts_on, ends_on").order("starts_on");
  if (error) throw new Error(`Could not load term dates: ${error.message}`);
  return (data as TermPeriodRow[]).map(mapTermPeriod);
}

/** Adds a term period, or changes it when `id` is given. Both dates are inclusive. */
export async function saveTermPeriod(input: { id?: string; label: string; startsOn: string; endsOn: string }): Promise<AdminResult> {
  if (!input || typeof input !== "object") return fail("Check the details and try again.");
  const label = typeof input.label === "string" ? input.label.trim() : "";
  if (!label) return fail("Give this term a name.");
  if (label.length > MAX_LABEL) return fail(`The name is too long (${MAX_LABEL} characters at most).`);
  if (!isRealDate(input.startsOn) || !isRealDate(input.endsOn)) return fail("Choose a first and a last day.");
  if (input.endsOn < input.startsOn) return fail("The last day must be on or after the first day.");
  if (input.id !== undefined && !isUuid(input.id)) return fail("We could not find that term.");

  const all = await db().from("term_periods").select("id, starts_on, ends_on");
  if (all.error) return unexpected("check overlapping terms", all.error);
  const clash = (all.data as { id: string; starts_on: string; ends_on: string }[]).some(
    (t) => t.id !== input.id && input.startsOn <= t.ends_on && t.starts_on <= input.endsOn,
  );
  if (clash) return fail("Those dates overlap another term period.");

  const row = { label, starts_on: input.startsOn, ends_on: input.endsOn };
  if (input.id === undefined) {
    const ins = await db().from("term_periods").insert(row);
    return ins.error ? unexpected("add term", ins.error) : OK;
  }
  const upd = await db().from("term_periods").update(row).eq("id", input.id).select("id");
  if (upd.error) return unexpected("update term", upd.error);
  return upd.data?.length ? OK : fail("We could not find that term.");
}

export async function deleteTermPeriod(id: string): Promise<AdminResult> {
  if (!isUuid(id)) return fail("We could not find that term.");
  const del = await db().from("term_periods").delete().eq("id", id).select("id");
  if (del.error) return unexpected("delete term", del.error);
  return del.data?.length ? OK : fail("We could not find that term.");
}
