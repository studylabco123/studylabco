import "server-only";
import { randomUUID } from "node:crypto";
import { mapGroupSession, type GroupSessionRow } from "@/lib/supabase/mappers";
import { addDays, londonDateTime, londonWeekday } from "@/lib/time";
import type { GroupSession, Level, Settings } from "@/lib/types";
import {
  db,
  loadFamily,
  loadGroupSessions,
  mapDbError,
  recordCoolingOff,
  rollback,
  sessionBookable,
  type ServiceOptions,
} from "./data";
import { checkEligibility } from "./eligibility";
import { onBookingCreated } from "./notify";
import { quote } from "./pricing";
import type { BookingFailure, BookingResult } from "./results";

interface GroupInput {
  /** From the server session, never from the form. */
  parentId: string;
  childId: string;
  coolingOff: boolean;
}

type Checked = { ok: true; settings: Settings; childLevel: Level } | { ok: false; reason: BookingFailure };

/** Ownership, eligibility (approved child etc.) and the cooling-off tick. */
async function precheck(
  input: GroupInput,
  type: "group" | "sunday_bundle",
  now: Date,
): Promise<Checked> {
  const family = await loadFamily(input.parentId, input.childId, now);
  if (!family) return { ok: false, reason: "child_not_found" };
  const eligibility = checkEligibility({
    profile: { isBlocked: family.isBlocked },
    owedPence: family.owedPence,
    hasAgreement: family.hasAgreement,
    assessmentBooked: family.assessmentBooked,
    approved: family.approved,
    childLevel: family.childLevel,
    request: { type },
    settings: family.settings,
  });
  if (!eligibility.ok) return eligibility;
  if (!input.coolingOff) return { ok: false, reason: "cooling_off_required" };
  return { ok: true, settings: family.settings, childLevel: family.childLevel };
}

type Seat = { ok: true; id: string } | { ok: false; reason: BookingFailure };

async function reserveSeat(
  session: GroupSession,
  input: GroupInput,
  price: number,
  bundleId: string | null = null,
): Promise<Seat> {
  const { data, error } = await db().rpc("reserve_group_seat", {
    p_session: session.id,
    p_parent: input.parentId,
    p_child: input.childId,
    p_price: price,
    p_bundle: bundleId,
  });
  if (error) {
    const reason = mapDbError(error);
    if (reason) return { ok: false, reason };
    throw new Error(`Could not reserve a seat: ${error.message}`);
  }
  return { ok: true, id: data as string };
}

/**
 * Takes one seat per session in order with the given prices. All-or-nothing:
 * if any seat fails, or anything throws (an unmapped database error, the
 * cooling-off insert), the seats already taken are removed.
 */
async function reserveAll(
  input: GroupInput,
  seats: { session: GroupSession; price: number; bundleId: string | null }[],
  opts: ServiceOptions,
): Promise<BookingResult> {
  const ids: string[] = [];
  const undo = () => rollback(ids);
  try {
    await opts.beforeSeats?.();
    for (const seat of seats) {
      const r = await reserveSeat(seat.session, input, seat.price, seat.bundleId);
      if (!r.ok) {
        await undo();
        return { ok: false, reason: r.reason };
      }
      ids.push(r.id);
    }
    await recordCoolingOff(input.parentId, ids[0]);
  } catch (err) {
    await undo();
    throw err;
  }
  await onBookingCreated(ids);
  return { ok: true, bookingId: ids[0] };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One seat on one group session at the group price. */
export async function createGroupBooking(
  input: GroupInput & { sessionId: string },
  opts: ServiceOptions = {},
): Promise<BookingResult> {
  const now = opts.now ?? new Date();
  const checked = await precheck(input, "group", now);
  if (!checked.ok) return checked;
  if (!UUID.test(input.sessionId)) return { ok: false, reason: "session_unavailable" };

  const { data, error } = await db()
    .from("group_sessions")
    .select("id, series_id, title, starts_at, ends_at, capacity, price_pence, venue, is_online, level, status")
    .eq("id", input.sessionId)
    .maybeSingle();
  if (error) throw new Error(`Could not load session: ${error.message}`);
  if (!data) return { ok: false, reason: "session_unavailable" };
  const session = mapGroupSession(data as GroupSessionRow);
  if (!sessionBookable(session, checked.settings, now)) return { ok: false, reason: "session_unavailable" };
  // A child books only sessions at their own level.
  if (session.level !== checked.childLevel) return { ok: false, reason: "level_mismatch" };

  // Ruling R17: a single seat is charged the session's own price.
  return reserveAll(input, [{ session, price: session.pricePence, bundleId: null }], opts);
}

/** Both Sunday sessions on `date` (London), sharing a bundle id, all-or-nothing. */
export async function createSundayBundle(
  input: GroupInput & { date: string },
  opts: ServiceOptions = {},
): Promise<BookingResult> {
  const now = opts.now ?? new Date();
  const checked = await precheck(input, "sunday_bundle", now);
  if (!checked.ok) return checked;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || londonWeekday(input.date) !== 0) {
    return { ok: false, reason: "session_unavailable" };
  }

  const { sessions } = await loadGroupSessions(
    londonDateTime(input.date, "00:00").toISOString(),
    londonDateTime(addDays(input.date, 1), "00:00").toISOString(),
    "sunday_bundle",
  );
  if (sessions.length !== 2 || !sessions.every((s) => sessionBookable(s, checked.settings, now))) {
    return { ok: false, reason: "session_unavailable" };
  }
  if (sessions.some((s) => s.level !== checked.childLevel)) return { ok: false, reason: "level_mismatch" };
  const prices = quote({ type: "sunday_bundle" }, checked.settings).perBookingPence;
  const bundleId = randomUUID();
  return reserveAll(
    input,
    sessions.map((session, i) => ({ session, price: prices[i], bundleId })),
    opts,
  );
}
