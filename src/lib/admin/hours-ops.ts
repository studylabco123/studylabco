import "server-only";
import { mapAvailabilityRule, type AvailabilityRuleRow } from "@/lib/supabase/mappers";
import { createServiceClient } from "@/lib/supabase/service";
import { parseTimeMinutes } from "@/lib/time";
import type { AvailabilityRule, BookingKind, LocationKind, PeriodKind } from "@/lib/types";
import { fail, OK, unexpected, type AdminResult } from "./result";

/** Write side of the weekly teaching hours. The caller has passed requireAdmin(). */

const db = () => createServiceClient();

export interface AvailabilityRuleInput {
  /** Present when editing an existing window. */
  id?: string;
  period: PeriodKind;
  weekday: number;
  startTime: string;
  endTime: string;
  kinds: BookingKind[];
  locations: LocationKind[];
}

const PERIODS: readonly string[] = ["term", "holiday"];
const KINDS: readonly string[] = ["assessment", "one_to_one"];
const LOCATIONS: readonly string[] = ["tutor_place", "home_visit", "online"];
const SUNDAY = 0;
const MIN_WINDOW_MINUTES = 60;
const COLUMNS = "id, period, weekday, start_time, end_time, kinds, locations";

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Minutes after midnight for 'HH:mm' on a :00 or :30; null otherwise. */
function halfHour(t: unknown): number | null {
  if (typeof t !== "string" || !/^([01]\d|2[0-3]):(00|30)$/.test(t)) return null;
  const m = parseTimeMinutes(t);
  return m < 24 * 60 && m % 30 === 0 ? m : null;
}

const subset = (value: unknown, allowed: readonly string[]): string[] | null =>
  Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === "string" && allowed.includes(v)) ? [...new Set(value as string[])] : null;

export async function listAvailabilityRules(): Promise<AvailabilityRule[]> {
  const { data, error } = await db().from("availability_rules").select(COLUMNS);
  if (error) throw new Error(`Could not load teaching hours: ${error.message}`);
  return (data as AvailabilityRuleRow[])
    .map(mapAvailabilityRule)
    .map((r) => ({ ...r, startTime: r.startTime.slice(0, 5), endTime: r.endTime.slice(0, 5) }))
    .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));
}

/** Adds a window, or changes it when `input.id` is given. */
export async function saveAvailabilityRule(input: AvailabilityRuleInput): Promise<AdminResult> {
  if (!input || typeof input !== "object") return fail("Check the details and try again.");
  if (!PERIODS.includes(input.period)) return fail("Choose term time or school holidays.");
  if (typeof input.weekday !== "number" || !Number.isInteger(input.weekday) || input.weekday < 0 || input.weekday > 6) return fail("Choose a day of the week.");
  const start = halfHour(input.startTime);
  const end = halfHour(input.endTime);
  if (start === null || end === null) return fail("Times must be on the hour or half past.");
  if (end <= start) return fail("The end must be after the start.");
  if (end - start < MIN_WINDOW_MINUTES) return fail("A time window must be at least one hour long.");
  const kinds = subset(input.kinds, KINDS);
  if (!kinds) return fail("Choose at least one type of lesson.");
  const locations = subset(input.locations, LOCATIONS);
  if (!locations) return fail("Choose at least one place.");
  if (locations.includes("home_visit") && input.weekday !== SUNDAY) return fail("Home visits can only be offered on Sundays.");
  if (input.id !== undefined && !isUuid(input.id)) return fail("We could not find that time window.");

  const same = await db().from("availability_rules").select("id, start_time, end_time").eq("period", input.period).eq("weekday", input.weekday);
  if (same.error) return unexpected("check overlapping hours", same.error);
  const clash = (same.data as { id: string; start_time: string; end_time: string }[]).some(
    (r) => r.id !== input.id && start < parseTimeMinutes(r.end_time) && parseTimeMinutes(r.start_time) < end,
  );
  if (clash) return fail("That overlaps another time window on the same day.");

  const row = { period: input.period, weekday: input.weekday, start_time: input.startTime, end_time: input.endTime, kinds, locations };
  if (input.id === undefined) {
    const ins = await db().from("availability_rules").insert(row);
    return ins.error ? unexpected("add hours", ins.error) : OK;
  }
  const upd = await db().from("availability_rules").update(row).eq("id", input.id).select("id");
  if (upd.error) return unexpected("update hours", upd.error);
  return upd.data?.length ? OK : fail("We could not find that time window.");
}

export async function deleteAvailabilityRule(id: string): Promise<AdminResult> {
  if (!isUuid(id)) return fail("We could not find that time window.");
  const del = await db().from("availability_rules").delete().eq("id", id).select("id");
  if (del.error) return unexpected("delete hours", del.error);
  return del.data?.length ? OK : fail("We could not find that time window.");
}
