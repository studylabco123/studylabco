import "server-only";
import { randomUUID } from "node:crypto";
import { notifyPassBought, notifyPassCancelled, notifyPassCreditFailed, sendPassPaymentReminder } from "@/lib/email/pass-notifications";
import { POLICY_VERSION } from "@/lib/policy";
import { mapGroupSession, mapPass, type BookingRow, type GroupSessionRow, type PassRow } from "@/lib/supabase/mappers";
import { formatLondon } from "@/lib/format";
import { addDays, londonDateOf, londonDateTime, londonWeekday } from "@/lib/time";
import type { GroupSession, Pass, PassSessions } from "@/lib/types";
import { db, loadFamily, loadGroupSessions, mapDbError, rollback, sessionBookable, type ServiceOptions } from "./data";
import { checkEligibility } from "./eligibility";
import { onBookingCreated } from "./notify";
import { passInCoolingOff, passRemaining, passSessionValuePence, passUnusedValuePence, passUsable, sessionsNeeded } from "./pass";
import { quote } from "./pricing";
import type { BookingFailure, BookingResult } from "./results";

// Group passes (v2 spec §3): buying, booking sessions with one, cancelling one.
// The parent id always comes from the server session, never from a form.

const DAY = 86_400_000;
const HOUR = 3_600_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(what: string, error: { message: string }): never {
  throw new Error(`${what}: ${error.message}`);
}

/** The pass if it belongs to this parent, else null. */
export async function loadPassFor(parentId: string, passId: string): Promise<Pass | null> {
  if (!UUID.test(passId)) return null;
  const { data, error } = await db().from("passes").select("*").eq("id", passId).eq("parent_id", parentId).maybeSingle();
  if (error) fail("Could not load pass", error);
  return data ? mapPass(data as PassRow) : null;
}

/** Every seat booked with these passes (any status). */
export async function passSeats(passIds: string[]): Promise<BookingRowLite[]> {
  if (!passIds.length) return [];
  const { data, error } = await db().from("bookings").select("id, status, pass_id, starts_at").in("pass_id", passIds);
  if (error) fail("Could not load pass sessions", error);
  return (data as { id: string; status: BookingRowLite["status"]; pass_id: string; starts_at: string }[]).map((r) => ({
    id: r.id,
    status: r.status,
    passId: r.pass_id,
    startsAt: new Date(r.starts_at),
  }));
}

export interface BookingRowLite {
  id: string;
  status: BookingRow["status"];
  passId: string | null;
  startsAt: Date;
}

// ---------------------------------------------------------------------------
// Buying
// ---------------------------------------------------------------------------

export type BuyPassResult = { ok: true; passId: string; reference: string } | { ok: false; reason: BookingFailure };

/**
 * A parent buys a 6- or 10-session pass for one approved child at the child's
 * level, priced from Settings. It starts 'awaiting_payment' (sessions unlock
 * once the tutor marks it paid). The cooling-off tick is required and recorded
 * as a consent row against the pass. The parent gets PassConfirmed (reference
 * and bank details) and the business a notice.
 */
export async function buyPass(
  input: { parentId: string; childId: string; sessions: PassSessions; coolingOff: boolean },
  opts: { now?: Date } = {},
): Promise<BuyPassResult> {
  const now = opts.now ?? new Date();
  const family = await loadFamily(input.parentId, input.childId, now);
  if (!family) return { ok: false, reason: "child_not_found" };
  const eligibility = checkEligibility({
    profile: { isBlocked: family.isBlocked },
    owedPence: family.owedPence,
    hasAgreement: family.hasAgreement,
    assessmentBooked: family.assessmentBooked,
    approved: family.approved,
    childLevel: family.childLevel,
    request: { type: "pass" },
    settings: family.settings,
  });
  if (!eligibility.ok) return eligibility;
  if (!input.coolingOff) return { ok: false, reason: "cooling_off_required" };
  if (input.sessions !== 6 && input.sessions !== 10) return { ok: false, reason: "session_unavailable" };

  const price = quote({ type: "pass", level: family.childLevel, sessions: input.sessions }, family.settings).totalPence;
  const c = db();
  const inserted = await c
    .from("passes")
    .insert({
      parent_id: input.parentId,
      child_id: input.childId,
      level: family.childLevel,
      sessions_total: input.sessions,
      price_pence: price,
      created_at: now.toISOString(),
    })
    .select("id, payment_reference")
    .single();
  if (inserted.error) fail("Could not create pass", inserted.error);
  const passId = inserted.data.id as string;

  const consent = await c.from("consents").insert({
    profile_id: input.parentId,
    kind: "cooling_off",
    policy_version: POLICY_VERSION,
    granted: true,
    pass_id: passId,
  });
  if (consent.error) {
    await c.from("passes").delete().eq("id", passId);
    fail("Could not record cooling-off consent", consent.error);
  }

  await notifyPassBought(passId);
  return { ok: true, passId, reference: inserted.data.payment_reference as string };
}

// ---------------------------------------------------------------------------
// Booking with a pass
// ---------------------------------------------------------------------------

export type PassBookingInput =
  | { parentId: string; passId: string; sessionId: string; sundayDate?: undefined }
  | { parentId: string; passId: string; sundayDate: string; sessionId?: undefined };

/**
 * Books one group session (or, with a GCSE pass, both Sunday sessions on
 * `sundayDate`, which use 2) with a pass. Checks, in order: the pass is this
 * parent's and usable (paid, not expired); the family may book; the child,
 * pass and session(s) are at the same level; the session(s) are bookable and
 * at least `passMinNoticeDays` away and before the pass expires; enough sessions are left. Seats are taken
 * with reserve_group_seat (p_pass, so the database re-checks the pass under a
 * lock) at `passSessionValuePence` each, all-or-nothing. No cooling-off tick
 * is asked: it was given when the pass was bought.
 */
export async function bookWithPass(input: PassBookingInput, opts: ServiceOptions = {}): Promise<BookingResult> {
  const now = opts.now ?? new Date();
  const pass = await loadPassFor(input.parentId, input.passId);
  if (!pass || !pass.childId) return { ok: false, reason: "pass_not_found" };
  if (!passUsable(pass, now)) return { ok: false, reason: "pass_not_usable" };

  const family = await loadFamily(input.parentId, pass.childId, now);
  if (!family) return { ok: false, reason: "pass_not_found" };
  const eligibility = checkEligibility({
    profile: { isBlocked: family.isBlocked },
    owedPence: family.owedPence,
    hasAgreement: family.hasAgreement,
    assessmentBooked: family.assessmentBooked,
    approved: family.approved,
    childLevel: family.childLevel,
    request: { type: "group" },
    settings: family.settings,
  });
  if (!eligibility.ok) return eligibility;
  // A child whose level changed keeps the pass, but it only books sessions at both levels.
  if (family.childLevel !== pass.level) return { ok: false, reason: "level_mismatch" };

  const picked = await pickSessions(input);
  if (!picked.ok) return picked;
  const { sessions } = picked;
  if (sessions.some((s) => s.level !== pass.level)) return { ok: false, reason: "level_mismatch" };
  if (!sessions.every((s) => sessionBookable(s, family.settings, now))) return { ok: false, reason: "session_unavailable" };
  const earliest = Math.min(...sessions.map((s) => s.startsAt.getTime()));
  if (earliest - now.getTime() < family.settings.passMinNoticeDays * DAY) return { ok: false, reason: "pass_too_soon" };

  // The pass cannot be used on or after its expiry (R7); say which day that is.
  if (pass.expiresAt && sessions.some((s) => s.startsAt.getTime() >= pass.expiresAt!.getTime())) {
    return {
      ok: false,
      reason: "pass_expires_first",
      message: `That session is after your pass expires on ${formatLondon(pass.expiresAt, "d MMMM yyyy")}.`,
    };
  }

  const needed = sessionsNeeded(input.sundayDate ? "sunday_bundle" : "session");
  if (passRemaining(pass, await passSeats([pass.id])) < needed) return { ok: false, reason: "pass_used_up" };

  const price = passSessionValuePence(pass);
  const bundleId = sessions.length > 1 ? randomUUID() : null;
  const ids: string[] = [];
  try {
    await opts.beforeSeats?.();
    for (const session of sessions) {
      const { data, error } = await db().rpc("reserve_group_seat", {
        p_session: session.id,
        p_parent: input.parentId,
        p_child: pass.childId,
        p_price: price,
        p_bundle: bundleId,
        p_pass: pass.id,
      });
      if (error) {
        const reason = mapDbError(error);
        await rollback(ids);
        if (reason) return { ok: false, reason };
        throw new Error(`Could not reserve a seat: ${error.message}`);
      }
      ids.push(data as string);
    }
  } catch (err) {
    await rollback(ids);
    throw err;
  }
  await onBookingCreated(ids);
  return { ok: true, bookingId: ids[0] };
}

type Picked = { ok: true; sessions: GroupSession[] } | { ok: false; reason: BookingFailure };

async function pickSessions(input: PassBookingInput): Promise<Picked> {
  if (input.sundayDate !== undefined) {
    const date = input.sundayDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || londonWeekday(date) !== 0) return { ok: false, reason: "session_unavailable" };
    const { sessions } = await loadGroupSessions(
      londonDateTime(date, "00:00").toISOString(),
      londonDateTime(addDays(date, 1), "00:00").toISOString(),
      "sunday_bundle",
    );
    return sessions.length === 2 ? { ok: true, sessions } : { ok: false, reason: "session_unavailable" };
  }
  if (!UUID.test(input.sessionId)) return { ok: false, reason: "session_unavailable" };
  const { data, error } = await db()
    .from("group_sessions")
    .select("id, series_id, title, starts_at, ends_at, capacity, price_pence, venue, is_online, level, status")
    .eq("id", input.sessionId)
    .maybeSingle();
  if (error) fail("Could not load session", error);
  return data ? { ok: true, sessions: [mapGroupSession(data as GroupSessionRow)] } : { ok: false, reason: "session_unavailable" };
}

// ---------------------------------------------------------------------------
// Ending a pass
// ---------------------------------------------------------------------------

export const PASS_NOT_REFUNDABLE = "Unused sessions can't be refunded — please contact Study Lab Co.";

export const CREDIT_PENDING_MESSAGE = "Your pass was cancelled. We'll add your credit shortly — Study Lab Co has been notified.";

export type EndPassResult =
  | { ok: true; creditPence: number }
  /** `creditFailed`: the pass is cancelled but its credit row could not be saved (the business has been emailed the amount). */
  | { ok: false; message: string; creditFailed?: boolean };

/**
 * Ends a pass: status 'cancelled' (conditional on its current status, so two
 * clicks cannot both do it), its future pending/confirmed sessions are
 * cancelled (they go back on the pass), and for a paid pass the unused
 * value (`passUnusedValuePence` of what is then left) becomes a ledger
 * 'credit' with pass_id, dated today in London. Credit is never income.
 */
export async function endPass(
  pass: Pass,
  now: Date,
  how: { by: "parent" | "tutor"; note: string },
): Promise<EndPassResult> {
  const c = db();
  const flipped = await c.from("passes").update({ status: "cancelled" }).eq("id", pass.id).eq("status", pass.status).select("id");
  if (flipped.error) fail("Could not cancel pass", flipped.error);
  if (!flipped.data?.length) return { ok: false, message: "This pass was just updated. Please refresh and check." };

  const seats = await c
    .from("bookings")
    .update({ status: "cancelled", cancelled_by: how.by, cancelled_at: now.toISOString(), payment_status: "unpaid" })
    .eq("pass_id", pass.id)
    .in("status", ["pending", "confirmed"])
    .gt("starts_at", now.toISOString());
  if (seats.error) fail("Could not cancel pass sessions", seats.error);

  if (!pass.paidAt) return { ok: true, creditPence: 0 };
  const credit = passUnusedValuePence(pass, passRemaining(pass, await passSeats([pass.id])));
  if (credit > 0) {
    const entry = await c.from("ledger").insert({
      pass_id: pass.id,
      parent_id: pass.parentId,
      kind: "credit",
      amount_pence: credit,
      occurred_on: londonDateOf(now),
      note: how.note,
    });
    if (entry.error) {
      console.error("endPass: credit ledger row failed", entry.error.message);
      await notifyPassCreditFailed(pass.id, credit);
      return {
        ok: false,
        creditFailed: true,
        message:
          how.by === "parent" ? CREDIT_PENDING_MESSAGE : "The pass is cancelled but the credit could not be saved. Please add it in Money.",
      };
    }
  }
  return { ok: true, creditPence: credit };
}

export type CancelPassResult =
  /** `message` is set when the credit is still to be added (the parent sees it instead of the usual text). */
  | { ok: true; creditPence: number; message?: string }
  | { ok: false; reason: "not_found" | "not_cancellable" | "too_late" | "error"; message: string };

/**
 * A parent cancels their own pass within the 14-day cooling-off from buying
 * it: unpaid → simply cancelled (nothing owed); paid → the unused value
 * becomes account credit. Later it is refused (the tutor can still convert
 * it to credit at their discretion).
 */
export async function cancelPassForParent(parentId: string, passId: string, opts: { now?: Date } = {}): Promise<CancelPassResult> {
  const now = opts.now ?? new Date();
  const pass = await loadPassFor(parentId, passId);
  if (!pass) return { ok: false, reason: "not_found", message: "We could not find that group pass." };
  if (pass.status !== "awaiting_payment" && pass.status !== "active") {
    return { ok: false, reason: "not_cancellable", message: "This group pass has already ended." };
  }
  if (!passInCoolingOff(pass, now)) return { ok: false, reason: "too_late", message: PASS_NOT_REFUNDABLE };
  try {
    const r = await endPass(pass, now, { by: "parent", note: "Group pass cancelled in the 14-day cooling-off" });
    if (r.ok) {
      await notifyPassCancelled(pass.id, r.creditPence);
      return r;
    }
    if (r.creditFailed) {
      await notifyPassCancelled(pass.id, null);
      return { ok: true, creditPence: 0, message: r.message };
    }
    return { ok: false, reason: "error", message: r.message };
  } catch (err) {
    console.error("cancelPassForParent failed", err);
    return { ok: false, reason: "error", message: "We could not cancel the pass. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// Daily cron
// ---------------------------------------------------------------------------

/**
 * Sends one payment reminder for each pass still awaiting payment 48 hours
 * after it was bought (idempotent through email_log), and marks active passes
 * whose expires_at has passed as 'expired'. Seats already booked stay booked.
 */
export async function runPassCron(now: Date = new Date()): Promise<{ reminders: number; expired: number; failed: number }> {
  const c = db();
  const waiting = await c
    .from("passes")
    .select("id")
    .eq("status", "awaiting_payment")
    .lte("created_at", new Date(now.getTime() - 48 * HOUR).toISOString());
  if (waiting.error) fail("Could not load passes awaiting payment", waiting.error);
  let reminders = 0;
  let failed = 0;
  for (const p of waiting.data as { id: string }[]) {
    try {
      if ((await sendPassPaymentReminder(p.id)) === "sent") reminders++;
    } catch (err) {
      failed++;
      console.error(`cron: pass reminder ${p.id} failed`, err);
    }
  }

  const expired = await c.from("passes").update({ status: "expired" }).eq("status", "active").lt("expires_at", now.toISOString()).select("id");
  if (expired.error) fail("Could not expire passes", expired.error);
  return { reminders, expired: expired.data?.length ?? 0, failed };
}
