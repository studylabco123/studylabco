import "server-only";
import { buildLines, loadBookings, loadPeople, safely } from "@/lib/email/notifications";
import { sendEmail } from "@/lib/email/send";
import { createServiceClient } from "@/lib/supabase/service";
import { addDays, londonDateOf, londonDateTime, londonWeekday } from "@/lib/time";
import type { GroupProduct } from "@/lib/types";
import { isRealDate } from "./calendar-ops";
import { poundsToPence } from "./settings-validation";
import { fail, OK, unexpected, type AdminResult, type Failure, type OpOptions } from "./result";

/** Group series and sessions. The caller has passed requireAdmin(). */

const db = () => createServiceClient();
const ACTIVE = ["pending", "confirmed", "attended"] as const;
const LIVE = ["pending", "confirmed"] as const;
/** How far ahead sessions are generated (12 weeks). */
export const GENERATE_AHEAD_DAYS = 84;
const MAX_TITLE = 120;

export interface SeriesInput {
  title: string;
  weekday: number;
  startTime: string;
  capacity: number;
  /** Pounds, as typed. */
  price: string;
  venue: string;
  isOnline: boolean;
  yearGroup: string;
  product: GroupProduct | "";
  startsOn: string;
}

export interface OneOffInput {
  title: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  capacity: number;
  price: string;
  venue: string;
  isOnline: boolean;
}

export interface EditInput {
  title: string;
  capacity: number;
  price: string;
  venue: string;
  isOnline: boolean;
}

type Common = { title: string; capacity: number; pricePence: number; venue: string | null };

function checkCommon(input: { title: unknown; capacity: unknown; price: unknown; venue: unknown }): Common | Failure {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title || title.length > MAX_TITLE) return fail(`Give the group a title (${MAX_TITLE} characters at most).`);
  const capacity = input.capacity;
  if (typeof capacity !== "number" || !Number.isInteger(capacity) || capacity < 1 || capacity > 100) {
    return fail("The number of seats must be a whole number from 1 to 100.");
  }
  const pricePence = typeof input.price === "string" ? poundsToPence(input.price) : null;
  if (pricePence === null) return fail("The price must be an amount in pounds, like 18 or 18.50.");
  const venue = typeof input.venue === "string" ? input.venue.trim() : "";
  if (venue.length > 300) return fail("The venue is too long.");
  return { title, capacity, pricePence, venue: venue || null };
}

const isFailure = (x: unknown): x is Failure => typeof x === "object" && x !== null && (x as Failure).ok === false;
const isTime = (t: unknown): t is string => typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

/** Creates a weekly series, then generates its sessions for the next 12 weeks. */
export async function createSeries(input: SeriesInput, opts: OpOptions = {}): Promise<AdminResult> {
  const common = checkCommon(input);
  if (isFailure(common)) return common;
  if (!Number.isInteger(input.weekday) || input.weekday < 0 || input.weekday > 6) return fail("Choose a day of the week.");
  if (!isTime(input.startTime)) return fail("Choose a start time.");
  if (!isRealDate(input.startsOn)) return fail("Choose the date the group starts from.");
  if (londonWeekday(input.startsOn) !== input.weekday) return fail("The start date is not on that day of the week.");
  const yearGroup = typeof input.yearGroup === "string" ? input.yearGroup.trim() : "";
  if (!yearGroup || yearGroup.length > 60) return fail("Say which year groups it is for, like Years 10 & 11.");
  const product = input.product === "" ? null : input.product;
  if (product !== null && product !== "saturday" && product !== "sunday_bundle") return fail("Choose a valid block product.");

  const ins = await db().from("group_series").insert({
    title: common.title,
    weekday: input.weekday,
    start_time: input.startTime,
    capacity: common.capacity,
    price_pence: common.pricePence,
    venue: common.venue,
    is_online: input.isOnline === true,
    year_group: yearGroup,
    product,
    active: true,
    starts_on: input.startsOn,
  });
  if (ins.error) return unexpected("create series", ins.error);
  const gen = await db().rpc("ensure_group_sessions", { p_until: addDays(londonDateOf(opts.now ?? new Date()), GENERATE_AHEAD_DAYS) });
  return gen.error ? unexpected("generate sessions", gen.error) : OK;
}

/** One session with no series (a catch-up, a workshop). */
export async function createOneOff(input: OneOffInput): Promise<AdminResult> {
  const common = checkCommon(input);
  if (isFailure(common)) return common;
  if (!isRealDate(input.date)) return fail("Choose a date.");
  if (!isTime(input.startTime)) return fail("Choose a start time.");
  const minutes = input.durationMinutes;
  if (!Number.isInteger(minutes) || minutes < 15 || minutes > 480) return fail("The length must be from 15 to 480 minutes.");
  const start = londonDateTime(input.date, input.startTime);
  const ins = await db().from("group_sessions").insert({
    series_id: null,
    title: common.title,
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + minutes * 60_000).toISOString(),
    capacity: common.capacity,
    price_pence: common.pricePence,
    venue: common.venue,
    is_online: input.isOnline === true,
    status: "scheduled",
  });
  return ins.error ? unexpected("create one-off", ins.error) : OK;
}

/** The most seats taken (pending, confirmed, attended) by any of these sessions. */
async function maxBooked(sessionIds: string[]): Promise<number | Failure> {
  if (sessionIds.length === 0) return 0;
  const { data, error } = await db().from("bookings").select("group_session_id").in("group_session_id", sessionIds).in("status", [...ACTIVE]);
  if (error) return unexpected("count seats", error);
  const counts = new Map<string, number>();
  for (const r of data as { group_session_id: string }[]) counts.set(r.group_session_id, (counts.get(r.group_session_id) ?? 0) + 1);
  return Math.max(0, ...counts.values());
}

/**
 * Edits a series and carries title, seats, price, venue and online/in-person
 * to its future scheduled sessions. Seats below what any of those sessions
 * already has booked are refused. Existing bookings keep the price they paid.
 */
export async function updateSeries(seriesId: string, input: EditInput, opts: OpOptions = {}): Promise<AdminResult> {
  const common = checkCommon(input);
  if (isFailure(common)) return common;
  const now = (opts.now ?? new Date()).toISOString();
  const found = await db().from("group_series").select("id").eq("id", seriesId).maybeSingle();
  if (found.error) return found.error.code === "22P02" ? fail("We could not find that group.") : unexpected("load series", found.error);
  if (!found.data) return fail("We could not find that group.");

  const future = await db().from("group_sessions").select("id").eq("series_id", seriesId).eq("status", "scheduled").gt("starts_at", now);
  if (future.error) return unexpected("load sessions", future.error);
  const booked = await maxBooked((future.data as { id: string }[]).map((s) => s.id));
  if (isFailure(booked)) return booked;
  if (common.capacity < booked) {
    return fail(`A session already has ${booked} ${booked === 1 ? "seat" : "seats"} booked. Choose at least ${booked} seats.`);
  }

  const fields = { title: common.title, capacity: common.capacity, price_pence: common.pricePence, venue: common.venue, is_online: input.isOnline === true };
  const up = await db().from("group_series").update(fields).eq("id", seriesId);
  if (up.error) return unexpected("update series", up.error);
  const sessions = await db().from("group_sessions").update(fields).eq("series_id", seriesId).eq("status", "scheduled").gt("starts_at", now);
  return sessions.error ? unexpected("update sessions", sessions.error) : OK;
}

/** Edits one scheduled session. */
export async function updateSession(sessionId: string, input: EditInput): Promise<AdminResult> {
  const common = checkCommon(input);
  if (isFailure(common)) return common;
  const found = await db().from("group_sessions").select("id, status").eq("id", sessionId).maybeSingle();
  if (found.error) return found.error.code === "22P02" ? fail("We could not find that session.") : unexpected("load session", found.error);
  if (!found.data) return fail("We could not find that session.");
  if (found.data.status !== "scheduled") return fail("A cancelled session cannot be edited.");
  const booked = await maxBooked([sessionId]);
  if (isFailure(booked)) return booked;
  if (common.capacity < booked) {
    return fail(`This session already has ${booked} ${booked === 1 ? "seat" : "seats"} booked. Choose at least ${booked} seats.`);
  }
  const up = await db()
    .from("group_sessions")
    .update({ title: common.title, capacity: common.capacity, price_pence: common.pricePence, venue: common.venue, is_online: input.isOnline === true })
    .eq("id", sessionId)
    .eq("status", "scheduled");
  return up.error ? unexpected("update session", up.error) : OK;
}

interface CancelRow {
  id: string;
  parent_id: string | null;
  price_pence: number;
  payment_status: string;
}

/**
 * Cancels a group session and every pending/confirmed seat on it (free for the
 * family, whatever the notice). A paid seat is refunded or credited per
 * `refund` (ledger entry dated today in London). Each family is emailed; an
 * email failure never undoes the cancellation.
 */
export async function cancelSession(sessionId: string, refund: boolean, opts: OpOptions = {}): Promise<AdminResult> {
  const now = opts.now ?? new Date();
  const flipped = await db()
    .from("group_sessions")
    .update({ status: "cancelled" })
    .eq("id", sessionId)
    .eq("status", "scheduled")
    .select("id");
  if (flipped.error) {
    return flipped.error.code === "22P02" ? fail("We could not find that session.") : unexpected("cancel session", flipped.error);
  }
  if (!flipped.data?.length) return fail("This session is already cancelled or could not be found.");

  const seats = await db().from("bookings").select("id, parent_id, price_pence, payment_status").eq("group_session_id", sessionId).in("status", [...LIVE]);
  if (seats.error) return unexpected("load seats", seats.error);

  let ledgerFailed = false;
  for (const seat of seats.data as CancelRow[]) {
    const wasPaid = seat.payment_status === "paid";
    const patch: Record<string, unknown> = { status: "cancelled", cancelled_by: "tutor", cancelled_at: now.toISOString() };
    if (wasPaid) patch.payment_status = refund ? "refunded" : "credited";
    const up = await db().from("bookings").update(patch).eq("id", seat.id).in("status", [...LIVE]).select("id");
    if (up.error) {
      console.error("admin: cancel seat failed", up.error.message);
      ledgerFailed = true;
      continue;
    }
    if (!up.data?.length) continue; // changed under us
    if (wasPaid) {
      const entry = await db().from("ledger").insert({
        booking_id: seat.id,
        parent_id: seat.parent_id,
        kind: refund ? "refund" : "credit",
        amount_pence: seat.price_pence,
        occurred_on: londonDateOf(now),
        note: "Group session cancelled by tutor",
      });
      if (entry.error) {
        console.error("admin: group cancel ledger failed", entry.error.message);
        ledgerFailed = true;
      }
    }
    await notifyGroupCancelled(seat.id, wasPaid, refund);
  }
  return ledgerFailed
    ? fail("The session is cancelled, but a booking or ledger entry could not be saved. Please check Bookings and Money.")
    : OK;
}

async function notifyGroupCancelled(bookingId: string, wasPaid: boolean, refunded: boolean): Promise<void> {
  await safely("group cancellation", async () => {
    const c = db();
    const [booking] = await loadBookings(c, [bookingId]);
    if (!booking?.parentId) return;
    const parent = (await loadPeople(c, [booking.parentId])).get(booking.parentId);
    if (!parent) return;
    const session = (await buildLines(c, [booking])).get(booking.id)!;
    await sendEmail({
      to: parent.email,
      template: "group_cancelled",
      bookingId,
      props: {
        parentName: parent.name,
        session,
        credited: wasPaid && !refunded,
        reason: wasPaid && refunded ? "We will refund what you paid." : null,
      },
    });
  });
}

export interface EndSeriesResult {
  ok: true;
  /** Future sessions with no bookings, removed. */
  removed: number;
  /** Future sessions that still have live bookings: cancel them one by one. */
  kept: number;
}

/**
 * Stops a series generating sessions (active = false). Future sessions nobody
 * ever booked are deleted; ones that only have cancelled bookings are marked
 * cancelled; ones with live bookings are left for a manual cancel (which
 * refunds/credits and emails the families).
 */
export async function endSeries(seriesId: string, opts: OpOptions = {}): Promise<EndSeriesResult | Failure> {
  const now = (opts.now ?? new Date()).toISOString();
  const off = await db().from("group_series").update({ active: false }).eq("id", seriesId).select("id");
  if (off.error) return off.error.code === "22P02" ? fail("We could not find that group.") : unexpected("end series", off.error);
  if (!off.data?.length) return fail("We could not find that group.");

  const future = await db().from("group_sessions").select("id").eq("series_id", seriesId).eq("status", "scheduled").gt("starts_at", now);
  if (future.error) return unexpected("load sessions", future.error);
  const ids = (future.data as { id: string }[]).map((s) => s.id);
  if (ids.length === 0) return { ok: true, removed: 0, kept: 0 };

  const rows = await db().from("bookings").select("group_session_id, status").in("group_session_id", ids);
  if (rows.error) return unexpected("load bookings", rows.error);
  const any = new Set<string>();
  const live = new Set<string>();
  for (const r of rows.data as { group_session_id: string; status: string }[]) {
    any.add(r.group_session_id);
    if (ACTIVE.includes(r.status as (typeof ACTIVE)[number])) live.add(r.group_session_id);
  }
  const unbooked = ids.filter((i) => !any.has(i));
  const onlyCancelled = ids.filter((i) => any.has(i) && !live.has(i));
  if (unbooked.length) {
    const del = await db().from("group_sessions").delete().in("id", unbooked);
    if (del.error) return unexpected("delete sessions", del.error);
  }
  if (onlyCancelled.length) {
    const cx = await db().from("group_sessions").update({ status: "cancelled" }).in("id", onlyCancelled);
    if (cx.error) return unexpected("cancel sessions", cx.error);
  }
  return { ok: true, removed: unbooked.length + onlyCancelled.length, kept: live.size };
}

export interface EmailGroupResult {
  ok: true;
  sent: number;
}

export const MAX_SUBJECT = 120;
export const MAX_MESSAGE = 2000;

/** Emails the families with a pending/confirmed seat on a session: one email per family. */
export async function emailGroup(sessionId: string, subject: unknown, message: unknown): Promise<EmailGroupResult | Failure> {
  const cleanSubject = typeof subject === "string" ? subject.replace(/[\r\n]+/g, " ").trim().slice(0, MAX_SUBJECT) : "";
  const body = typeof message === "string" ? message.trim() : "";
  if (!cleanSubject) return fail("Write a subject.");
  if (!body) return fail("Write a message.");
  if (body.length > MAX_MESSAGE) return fail(`The message is too long (${MAX_MESSAGE} characters at most).`);

  const session = await db().from("group_sessions").select("id, status").eq("id", sessionId).maybeSingle();
  if (session.error) return session.error.code === "22P02" ? fail("We could not find that session.") : unexpected("load session", session.error);
  if (!session.data) return fail("We could not find that session.");

  const seats = await db().from("bookings").select("parent_id").eq("group_session_id", sessionId).in("status", [...LIVE]);
  if (seats.error) return unexpected("load seats", seats.error);
  const people = await loadPeople(db(), (seats.data as { parent_id: string | null }[]).map((s) => s.parent_id)).catch((err: Error) => err);
  if (people instanceof Error) return unexpected("load families", people);
  if (people.size === 0) return fail("Nobody is booked on this session yet.");

  let sent = 0;
  for (const p of people.values()) {
    await safely("group message", async () => {
      await sendEmail({ to: p.email, template: "group_message", props: { parentName: p.name, subject: cleanSubject, message: body } });
      sent += 1;
    });
  }
  return { ok: true, sent };
}
