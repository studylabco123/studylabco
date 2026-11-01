import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Interval } from "@/lib/calendar/slots";
import { POLICY_VERSION } from "@/lib/policy";
import { getSettings } from "@/lib/settings";
import {
  mapAvailabilityRule,
  mapBlockedRule,
  mapBlockedTime,
  mapBooking,
  mapGroupSession,
  mapTermPeriod,
  type AvailabilityRuleRow,
  type BlockedRuleRow,
  type BlockedTimeRow,
  type BookingRow,
  type GroupSessionRow,
  type TermPeriodRow,
} from "@/lib/supabase/mappers";
import { createServiceClient } from "@/lib/supabase/service";
import { addDays, londonDateTime } from "@/lib/time";
import type {
  Level,
  AvailabilityRule,
  BlockedRule,
  BlockedTime,
  GroupProduct,
  GroupSession,
  Settings,
  TermPeriod,
} from "@/lib/types";
import { amountOwedPence } from "./owed";
import type { BookingFailure } from "./results";

/** Shared by the booking services: a fixed `now` and a race hook for tests. */
export interface ServiceOptions {
  now?: Date;
  /** Runs after the slot check and before the insert (tests simulate races here). */
  afterSlotCheck?: () => Promise<void>;
  /** Group bookings: runs after the checks, before any seat is taken. */
  beforeSeats?: () => Promise<void>;
}

export const ACTIVE_STATUSES = ["pending", "confirmed", "attended"] as const;

export function db(): SupabaseClient {
  return createServiceClient();
}

function fail(what: string, error: { message: string }): never {
  throw new Error(`${what}: ${error.message}`);
}

/** Everything the eligibility check needs about one parent and child. */
export interface Family {
  settings: Settings;
  childFirstName: string;
  isBlocked: boolean;
  owedPence: number;
  hasAgreement: boolean;
  approved: boolean;
  assessmentBooked: boolean;
  childLevel: Level;
  childSchoolYear: number;
}

/** Loads the family for `childId`, or null when the child is not this parent's. */
export async function loadFamily(parentId: string, childId: string, now: Date): Promise<Family | null> {
  const c = db();
  const child = await c.from("children").select("id, first_name, school_year, level").eq("id", childId).eq("parent_id", parentId).maybeSingle();
  if (child.error) {
    // An invalid uuid is just "not found".
    if (child.error.code === "22P02") return null;
    fail("Could not load child", child.error);
  }
  if (!child.data) return null;

  const [settings, profile, bookings, agreement, status] = await Promise.all([
    getSettings(),
    c.from("profiles").select("is_blocked").eq("id", parentId).single(),
    c.from("bookings").select("*").eq("parent_id", parentId),
    c.from("agreements").select("id").eq("child_id", childId).maybeSingle(),
    c.from("student_status").select("approved_at").eq("child_id", childId).maybeSingle(),
  ]);
  if (profile.error) fail("Could not load profile", profile.error);
  if (bookings.error) fail("Could not load bookings", bookings.error);
  if (agreement.error) fail("Could not load agreement", agreement.error);
  if (status.error) fail("Could not load student status", status.error);

  const mine = (bookings.data as BookingRow[]).map(mapBooking);
  return {
    settings,
    childFirstName: child.data.first_name as string,
    childLevel: child.data.level as Level,
    childSchoolYear: child.data.school_year as number,
    isBlocked: profile.data.is_blocked as boolean,
    owedPence: amountOwedPence(mine, [], now, settings.lateFeePercent),
    hasAgreement: agreement.data !== null,
    approved: Boolean(status.data?.approved_at),
    assessmentBooked: mine.some(
      (b) =>
        b.childId === childId &&
        b.kind === "assessment" &&
        (ACTIVE_STATUSES as readonly string[]).includes(b.status),
    ),
  };
}

export interface SlotData {
  rules: AvailabilityRule[];
  terms: TermPeriod[];
  blocks: BlockedTime[];
  blockRules: BlockedRule[];
  busy: Interval[];
}

/**
 * Calendar data for London dates fromDate..toDate, loaded with the service
 * client (blocked tables are admin-only). Busy = active 1-to-1/assessment
 * bookings [starts_at, busy_until) plus scheduled group sessions.
 */
export async function loadSlotData(fromDate: string, toDate: string): Promise<SlotData> {
  const c = db();
  // A day either side covers buffers that straddle midnight.
  const from = londonDateTime(addDays(fromDate, -1), "00:00").toISOString();
  const to = londonDateTime(addDays(toDate, 2), "00:00").toISOString();
  const [rules, terms, blocks, blockRules, bookings, sessions] = await Promise.all([
    c.from("availability_rules").select("id, period, weekday, start_time, end_time, kinds, locations"),
    c.from("term_periods").select("id, label, starts_on, ends_on"),
    c.from("blocked_times").select("id, starts_at, ends_at, reason, is_default").lt("starts_at", to).gt("ends_at", from),
    c.from("blocked_rules").select("id, weekday, start_time, end_time, valid_from, valid_to, reason"),
    c
      .from("bookings")
      .select("starts_at, busy_until")
      .neq("kind", "group")
      .in("status", [...ACTIVE_STATUSES])
      .lt("starts_at", to)
      .gt("busy_until", from),
    c.from("group_sessions").select("starts_at, ends_at").eq("status", "scheduled").lt("starts_at", to).gt("ends_at", from),
  ]);
  for (const [what, r] of Object.entries({ rules, terms, blocks, blockRules, bookings, sessions })) {
    if (r.error) fail(`Could not load ${what}`, r.error);
  }
  const busy: Interval[] = [
    ...(bookings.data as { starts_at: string; busy_until: string }[]).map((b) => ({
      start: new Date(b.starts_at),
      end: new Date(b.busy_until),
    })),
    ...(sessions.data as { starts_at: string; ends_at: string }[]).map((s) => ({
      start: new Date(s.starts_at),
      end: new Date(s.ends_at),
    })),
  ];
  return {
    rules: (rules.data as AvailabilityRuleRow[]).map(mapAvailabilityRule),
    terms: (terms.data as TermPeriodRow[]).map(mapTermPeriod),
    blocks: (blocks.data as BlockedTimeRow[]).map(mapBlockedTime),
    blockRules: (blockRules.data as BlockedRuleRow[]).map(mapBlockedRule),
    busy,
  };
}

/** Records the cooling-off acknowledgement against the (first) booking. */
export async function recordCoolingOff(parentId: string, bookingId: string): Promise<void> {
  const { error } = await db().from("consents").insert({
    profile_id: parentId,
    kind: "cooling_off",
    policy_version: POLICY_VERSION,
    granted: true,
    booking_id: bookingId,
  });
  if (error) fail("Could not record cooling-off consent", error);
}

/** Removes bookings created by a multi-seat request that failed part-way. */
export async function rollback(bookingIds: string[]): Promise<void> {
  if (!bookingIds.length) return;
  const { error } = await db().from("bookings").delete().in("id", bookingIds);
  if (error) fail("Could not roll back bookings", error);
}

/** Maps Postgres errors from inserts and reserve_group_seat to booking failures. */
export function mapDbError(error: { code?: string; message?: string }): BookingFailure | null {
  if (error.code === "23P01") return "slot_taken";
  if (error.code === "23505" && error.message?.includes("bookings_child_group_session_key")) return "already_booked";
  if (error.code === "P0001") {
    if (error.message === "session_full") return "session_full";
    if (error.message === "session_cancelled") return "session_cancelled";
    if (error.message === "session_not_found") return "session_unavailable";
    if (error.message === "pass_not_found") return "pass_not_found";
    if (error.message === "pass_not_usable") return "pass_not_usable";
    if (error.message === "pass_used_up") return "pass_used_up";
    if (error.message === "level_mismatch") return "level_mismatch";
  }
  return null;
}

/** Creates group sessions up to `until` (London date) if they don't exist yet. */
export async function ensureGroupSessions(until: string): Promise<void> {
  const { error } = await db().rpc("ensure_group_sessions", { p_until: until });
  if (error) fail("Could not create group sessions", error);
}

/** Group sessions in [fromIso, toIso), optionally for one product, with seats left. */
export async function loadGroupSessions(
  fromIso: string,
  toIso: string,
  product?: GroupProduct,
): Promise<{ sessions: GroupSession[]; seatsLeft: Record<string, number> }> {
  const c = db();
  let q = c
    .from("group_sessions")
    .select("id, series_id, title, starts_at, ends_at, capacity, price_pence, venue, is_online, level, status")
    .gte("starts_at", fromIso)
    .lt("starts_at", toIso)
    .order("starts_at");
  if (product) {
    const series = await c.from("group_series").select("id").eq("product", product);
    if (series.error) fail("Could not load group series", series.error);
    q = q.in("series_id", (series.data as { id: string }[]).map((s) => s.id));
  }
  const res = await q;
  if (res.error) fail("Could not load group sessions", res.error);
  const sessions = (res.data as GroupSessionRow[]).map(mapGroupSession);
  return { sessions, seatsLeft: await seatsLeftFor(sessions) };
}

async function seatsLeftFor(sessions: GroupSession[]): Promise<Record<string, number>> {
  const left: Record<string, number> = Object.fromEntries(sessions.map((s) => [s.id, s.capacity]));
  if (!sessions.length) return left;
  const { data, error } = await db()
    .from("bookings")
    .select("group_session_id")
    .in("group_session_id", sessions.map((s) => s.id))
    .in("status", [...ACTIVE_STATUSES]);
  if (error) fail("Could not count seats", error);
  for (const b of data as { group_session_id: string }[]) left[b.group_session_id] -= 1;
  for (const id of Object.keys(left)) left[id] = Math.max(0, left[id]);
  return left;
}

/**
 * True when a session can still be booked now: scheduled, within the notice
 * and booking window, and not an online group while online lessons are off.
 */
export function sessionBookable(s: GroupSession, settings: Settings, now: Date): boolean {
  const t = s.startsAt.getTime();
  return (
    s.status === "scheduled" &&
    (settings.onlineEnabled || !s.isOnline) &&
    t >= now.getTime() + settings.minNoticeHours * 3600_000 &&
    t <= now.getTime() + settings.bookingWindowDays * 86400_000
  );
}
