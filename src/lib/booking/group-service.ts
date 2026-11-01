import "server-only";
import { randomUUID } from "node:crypto";
import { mapGroupSession, type GroupSessionRow } from "@/lib/supabase/mappers";
import { addDays, londonDateOf, londonDateTime, londonWeekday } from "@/lib/time";
import type { BlockWeeks, GroupProduct, GroupSession, Settings } from "@/lib/types";
import { planBlock } from "./block";
import {
  db,
  ensureGroupSessions,
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

type Checked = { ok: true; settings: Settings } | { ok: false; reason: BookingFailure };

/** Ownership, eligibility (approved child etc.) and the cooling-off tick. */
async function precheck(
  input: GroupInput,
  type: "group" | "sunday_bundle" | "block",
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
    request: { type },
    settings: family.settings,
  });
  if (!eligibility.ok) return eligibility;
  if (!input.coolingOff) return { ok: false, reason: "cooling_off_required" };
  return { ok: true, settings: family.settings };
}

type Seat = { ok: true; id: string } | { ok: false; reason: BookingFailure };

async function reserveSeat(
  session: GroupSession,
  input: GroupInput,
  price: number,
  bundleId: string | null = null,
  blockId: string | null = null,
): Promise<Seat> {
  const { data, error } = await db().rpc("reserve_group_seat", {
    p_session: session.id,
    p_parent: input.parentId,
    p_child: input.childId,
    p_price: price,
    p_bundle: bundleId,
    p_block: blockId,
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
 * cooling-off insert), the seats already taken and the block row are removed.
 */
async function reserveAll(
  input: GroupInput,
  seats: { session: GroupSession; price: number; bundleId: string | null }[],
  opts: ServiceOptions,
  blockId: string | null = null,
): Promise<BookingResult> {
  const ids: string[] = [];
  const undo = () => rollback(ids, blockId ?? undefined);
  try {
    await opts.beforeSeats?.();
    for (const seat of seats) {
      const r = await reserveSeat(seat.session, input, seat.price, seat.bundleId, blockId);
      if (!r.ok) {
        await undo();
        // A block names the week that filled up meanwhile.
        return r.reason === "session_full" && blockId
          ? { ok: false, reason: r.reason, fullDate: londonDateOf(seat.session.startsAt) }
          : { ok: false, reason: r.reason };
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
    .select("id, series_id, title, starts_at, ends_at, capacity, price_pence, venue, is_online, status")
    .eq("id", input.sessionId)
    .maybeSingle();
  if (error) throw new Error(`Could not load session: ${error.message}`);
  if (!data) return { ok: false, reason: "session_unavailable" };
  const session = mapGroupSession(data as GroupSessionRow);
  if (!sessionBookable(session, checked.settings, now)) return { ok: false, reason: "session_unavailable" };

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
  const prices = quote({ type: "sunday_bundle" }, checked.settings).perBookingPence;
  const bundleId = randomUUID();
  return reserveAll(
    input,
    sessions.map((session, i) => ({ session, price: prices[i], bundleId })),
    opts,
  );
}

/**
 * A 6- or 10-week Saturday or Sunday-bundle block from `firstDate`: one held
 * block_bookings row (hold 72 h) and one seat per planned session.
 */
export async function createBlockBooking(
  input: GroupInput & { product: GroupProduct; weeks: BlockWeeks; firstDate: string },
  opts: ServiceOptions = {},
): Promise<BookingResult> {
  const now = opts.now ?? new Date();
  const checked = await precheck(input, "block", now);
  if (!checked.ok) return checked;
  const { product, weeks, firstDate } = input;
  if (
    (product !== "saturday" && product !== "sunday_bundle") ||
    (weeks !== 6 && weeks !== 10) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(firstDate)
  ) {
    return { ok: false, reason: "session_unavailable" };
  }

  // Generous horizon: cancelled or closed weeks push the block later.
  const until = addDays(firstDate, 7 * (weeks + 8));
  await ensureGroupSessions(until);
  const { sessions, seatsLeft } = await loadGroupSessions(
    londonDateTime(firstDate, "00:00").toISOString(),
    londonDateTime(addDays(until, 1), "00:00").toISOString(),
    product,
  );
  const plan = planBlock(sessions, seatsLeft, product, weeks, firstDate);
  if (!plan.ok) {
    return "fullDate" in plan
      ? { ok: false, reason: "session_full", fullDate: plan.fullDate }
      : { ok: false, reason: "session_unavailable" };
  }
  const planned = plan.sessionIds.map((id) => sessions.find((s) => s.id === id)!);
  if (londonDateOf(planned[0].startsAt) !== firstDate || !sessionBookable(planned[0], checked.settings, now)) {
    return { ok: false, reason: "session_unavailable" };
  }

  const price = quote({ type: "block", product, weeks }, checked.settings);
  const block = await db()
    .from("block_bookings")
    .insert({
      parent_id: input.parentId,
      child_id: input.childId,
      product,
      weeks,
      price_pence: price.totalPence,
      hold_expires_at: new Date(now.getTime() + 72 * 3600_000).toISOString(),
      status: "held",
    })
    .select("id")
    .single();
  if (block.error) throw new Error(`Could not create block: ${block.error.message}`);

  const blockId = block.data.id as string;
  // Nothing may leave a held block row behind (reserveAll also removes its seats).
  try {
    const bundles = new Map<string, string>();
    const bundleFor = (s: GroupSession): string | null => {
      if (product !== "sunday_bundle") return null;
      const date = londonDateOf(s.startsAt);
      if (!bundles.has(date)) bundles.set(date, randomUUID());
      return bundles.get(date)!;
    };
    return await reserveAll(
      input,
      planned.map((session, i) => ({ session, price: price.perBookingPence[i], bundleId: bundleFor(session) })),
      opts,
      blockId,
    );
  } catch (err) {
    await rollback([], blockId);
    throw err;
  }
}
