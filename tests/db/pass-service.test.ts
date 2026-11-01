/**
 * Group passes (v2 §3) against the local Supabase stack.
 * `now` is pinned: Sunday 1 Nov 2026 09:00 GMT. Saturday (KS3) sessions start
 * 08:15 London and Sunday (GCSE) sessions 08:15 and 09:15.
 */
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { convertPassToCredit, markPassPaid } from "@/lib/admin/pass-ops";
import { markNoShow, recordLateCancellation, tutorCancel } from "@/lib/admin/lifecycle";
import { cancelSession } from "@/lib/admin/group-ops";
import { cancelBookingForParent } from "@/lib/booking/cancel";
import { amountOwedPence } from "@/lib/booking/owed";
import { bookWithPass, buyPass, cancelPassForParent, runPassCron } from "@/lib/booking/pass-service";
import { testOutbox } from "@/lib/email/send";
import { mapBooking, type BookingRow } from "@/lib/supabase/mappers";
import { closeDb, createChild, createUser, db, resetData } from "./setup";

const NOW = new Date("2026-11-01T09:00:00Z");
const DAY = 86_400_000;
const opts = { now: NOW };

let parentId: string;
let ks3: string;
let gcse: string;
let stdout: { mockRestore: () => void };

async function signAndApprove(child: string) {
  await db.query(
    `insert into agreements (child_id, policy_version, emergency_contact_name, emergency_contact_phone, consent_contact, signed_name)
     values ($1, '2026-11-01', 'Gran', '01632960123', true, 'Pat Parent')`,
    [child],
  );
  await db.query("insert into student_status (child_id, assessment_completed_at, approved_at) values ($1, now(), now())", [child]);
}

/** Session ids on a London date, in start order. */
async function sessions(date: string): Promise<{ id: string; starts_at: Date }[]> {
  const { rows } = await db.query<{ id: string; starts_at: Date }>(
    "select id, starts_at from group_sessions where (starts_at at time zone 'Europe/London')::date = $1 order by starts_at",
    [date],
  );
  return rows;
}

const passRow = async (id: string) =>
  (await db.query("select status, paid_at, expires_at, price_pence, sessions_total, level, payment_reference, created_at from passes where id = $1", [id])).rows[0];
const seatRow = async (id: string) =>
  (await db.query("select status::text, payment_status::text, price_pence, fee_pence, pass_id, bundle_id from bookings where id = $1", [id])).rows[0];
const ledger = async () =>
  (await db.query("select kind::text, amount_pence, method::text, pass_id, booking_id, to_char(occurred_on, 'YYYY-MM-DD') as occurred_on from ledger order by created_at")).rows;
const liveSeats = async (passId: string) =>
  (await db.query<{ n: number }>("select count(*)::int as n from bookings where pass_id = $1 and status in ('pending','confirmed','attended')", [passId])).rows[0].n;

async function buy(childId: string, sessionsTotal: 6 | 10 = 6, at: Date = NOW): Promise<string> {
  const r = await buyPass({ parentId, childId, sessions: sessionsTotal, coolingOff: true }, { now: at });
  if (!r.ok) throw new Error(`buyPass failed: ${r.reason}`);
  return r.passId;
}

async function paidPass(childId: string, sessionsTotal: 6 | 10 = 6): Promise<string> {
  const id = await buy(childId, sessionsTotal);
  const paid = await markPassPaid(id, "bank_transfer", { now: NOW });
  if (!paid.ok) throw new Error(`markPassPaid failed: ${paid.message}`);
  return id;
}

async function owed(): Promise<number> {
  const { rows } = await db.query("select * from bookings where parent_id = $1", [parentId]);
  return amountOwedPence((rows as BookingRow[]).map((r) => mapBooking({ ...r, starts_at: new Date(r.starts_at).toISOString() } as BookingRow)), [], new Date("2027-01-01T00:00:00Z"), 50);
}

beforeEach(async () => {
  await resetData();
  parentId = (await createUser({ fullName: "Pat Parent" })).id;
  ks3 = await createChild(parentId, { firstName: "Junior", schoolYear: 8, level: "KS3" });
  gcse = await createChild(parentId, { firstName: "Senior", schoolYear: 10, level: "GCSE" });
  await signAndApprove(ks3);
  await signAndApprove(gcse);
  await db.query("select public.ensure_group_sessions('2027-03-31')");
  stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true) as unknown as typeof stdout;
  testOutbox.length = 0;
});
afterEach(() => stdout.mockRestore());
afterAll(closeDb);

describe("buying a pass", () => {
  test("buy pass → awaiting_payment, reference SLC-####", async () => {
    const r = await buyPass({ parentId, childId: ks3, sessions: 6, coolingOff: true }, opts);
    expect(r).toMatchObject({ ok: true, reference: expect.stringMatching(/^SLC-\d{4,}$/) });
    if (!r.ok) return;
    expect(await passRow(r.passId)).toMatchObject({ status: "awaiting_payment", paid_at: null, expires_at: null, price_pence: 7900, sessions_total: 6, level: "KS3" });
    const consents = (await db.query("select kind, pass_id from consents where profile_id = $1", [parentId])).rows;
    expect(consents).toEqual([{ kind: "cooling_off", pass_id: r.passId }]);
    const parentMail = testOutbox.find((e) => e.template === "pass_confirmed");
    expect(parentMail?.text).toContain(r.reference);
    expect(parentMail?.text).toContain("£79");
    expect(parentMail?.text).toContain("Sessions unlock once we've received your payment");
    expect(parentMail?.text).toMatch(/6 months/);
    expect(testOutbox.some((e) => e.template === "admin_new_pass")).toBe(true);
  });

  test("the cooling-off tick is required, the child must be the parent's and approved", async () => {
    expect(await buyPass({ parentId, childId: ks3, sessions: 6, coolingOff: false }, opts)).toEqual({ ok: false, reason: "cooling_off_required" });
    const other = (await createUser()).id;
    expect(await buyPass({ parentId: other, childId: ks3, sessions: 6, coolingOff: true }, opts)).toEqual({ ok: false, reason: "child_not_found" });
    const fresh = await createChild(parentId, { firstName: "Fresh", schoolYear: 8, level: "KS3" });
    await db.query(
      `insert into agreements (child_id, policy_version, emergency_contact_name, emergency_contact_phone, consent_contact, signed_name)
       values ($1, '2026-11-01', 'Gran', '01632960123', true, 'Pat Parent')`,
      [fresh],
    );
    expect(await buyPass({ parentId, childId: fresh, sessions: 6, coolingOff: true }, opts)).toEqual({ ok: false, reason: "assessment_required" });
    expect((await db.query("select count(*)::int as n from passes")).rows[0].n).toBe(0);
  });

  test("GCSE 10-session pass is priced from settings", async () => {
    const id = await buy(gcse, 10);
    expect(await passRow(id)).toMatchObject({ price_pence: 16200, sessions_total: 10, level: "GCSE" });
  });
});

describe("paying for a pass", () => {
  test("cannot book with unpaid pass", async () => {
    const id = await buy(ks3);
    const [sat] = await sessions("2026-11-14");
    expect(await bookWithPass({ parentId, passId: id, sessionId: sat.id }, opts)).toEqual({ ok: false, reason: "pass_not_usable" });
    expect(await liveSeats(id)).toBe(0);
  });

  test("markPassPaid sets expires_at +6 months and ledger payment with pass_id", async () => {
    const id = await buy(ks3);
    // 00:30 London on 2 Nov is 00:30 UTC (GMT); the ledger uses the London date.
    const paidAt = new Date("2026-11-02T00:30:00Z");
    expect(await markPassPaid(id, "bank_transfer", { now: paidAt })).toEqual({ ok: true });
    const p = await passRow(id);
    expect(p.status).toBe("active");
    expect(new Date(p.paid_at).toISOString()).toBe(paidAt.toISOString());
    // 00:30 GMT on 2 Nov → 00:30 BST on 2 May (23:30 UTC on 1 May).
    expect(new Date(p.expires_at).toISOString()).toBe("2027-05-01T23:30:00.000Z");
    expect(await ledger()).toEqual([
      { kind: "payment", amount_pence: 7900, method: "bank_transfer", pass_id: id, booking_id: null, occurred_on: "2026-11-02" },
    ]);
    expect((await markPassPaid(id, "cash", { now: paidAt })).ok).toBe(false);
    expect(await ledger()).toHaveLength(1);
  });
});

describe("booking with a pass", () => {
  test("book 6 days ahead refused, 8 days ok", async () => {
    const id = await paidPass(ks3);
    const [sat] = await sessions("2026-11-14");
    const sixDays = new Date(sat.starts_at.getTime() - 6 * DAY);
    const eightDays = new Date(sat.starts_at.getTime() - 8 * DAY);
    expect(await bookWithPass({ parentId, passId: id, sessionId: sat.id }, { now: sixDays })).toEqual({ ok: false, reason: "pass_too_soon" });
    const r = await bookWithPass({ parentId, passId: id, sessionId: sat.id }, { now: eightDays });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await seatRow(r.bookingId)).toMatchObject({ status: "confirmed", payment_status: "paid", price_pence: 1316, pass_id: id });
    expect(await liveSeats(id)).toBe(1);
    expect(testOutbox.some((e) => e.template === "booking_confirmed")).toBe(true);
  });

  test("another parent cannot use the pass", async () => {
    const id = await paidPass(ks3);
    const other = (await createUser()).id;
    const [sat] = await sessions("2026-11-14");
    expect(await bookWithPass({ parentId: other, passId: id, sessionId: sat.id }, opts)).toEqual({ ok: false, reason: "pass_not_found" });
    expect(await bookWithPass({ parentId, passId: "not-a-uuid", sessionId: sat.id }, opts)).toEqual({ ok: false, reason: "pass_not_found" });
  });

  test("KS3 pass cannot book GCSE session", async () => {
    const id = await paidPass(ks3);
    const [sun] = await sessions("2026-11-15");
    expect(await bookWithPass({ parentId, passId: id, sessionId: sun.id }, opts)).toEqual({ ok: false, reason: "level_mismatch" });
    expect(await bookWithPass({ parentId, passId: id, sundayDate: "2026-11-15" }, opts)).toEqual({ ok: false, reason: "level_mismatch" });
  });

  test("Sunday bundle uses 2", async () => {
    const id = await paidPass(gcse);
    const r = await bookWithPass({ parentId, passId: id, sundayDate: "2026-11-15" }, opts);
    expect(r.ok).toBe(true);
    const seats = (await db.query("select price_pence, bundle_id, pass_id from bookings where pass_id = $1 order by starts_at", [id])).rows;
    expect(seats).toHaveLength(2);
    expect(seats[0].bundle_id).not.toBeNull();
    expect(seats[1].bundle_id).toBe(seats[0].bundle_id);
    expect(seats.map((s) => s.price_pence)).toEqual([1700, 1700]);
    // 4 left; take 3 single sessions, then a bundle needs 2 with only 1 left.
    for (const date of ["2026-11-22", "2026-11-29"]) {
      const [s1, s2] = await sessions(date);
      expect((await bookWithPass({ parentId, passId: id, sessionId: s1.id }, opts)).ok).toBe(true);
      if (date === "2026-11-22") expect((await bookWithPass({ parentId, passId: id, sessionId: s2.id }, opts)).ok).toBe(true);
    }
    expect(await liveSeats(id)).toBe(5);
    expect(await bookWithPass({ parentId, passId: id, sundayDate: "2026-11-15" }, opts)).toEqual({ ok: false, reason: "pass_used_up" });
    expect(await bookWithPass({ parentId, passId: id, sundayDate: "2026-11-08" }, opts)).toEqual({ ok: false, reason: "pass_too_soon" });
    // 29 Nov 09:15 is just past the 28-day booking window from NOW; a day later it is open.
    const [, last] = await sessions("2026-11-29");
    expect((await bookWithPass({ parentId, passId: id, sessionId: last.id }, { now: new Date(NOW.getTime() + DAY) })).ok).toBe(true);
    expect(await bookWithPass({ parentId, passId: id, sundayDate: "2026-11-22" }, opts)).toEqual({ ok: false, reason: "pass_used_up" });
    expect(await liveSeats(id)).toBe(6);
  });

  test("expired pass refuses new bookings but keeps booked seats", async () => {
    const id = await paidPass(ks3);
    const [sat] = await sessions("2026-11-14");
    const booked = await bookWithPass({ parentId, passId: id, sessionId: sat.id }, opts);
    expect(booked.ok).toBe(true);
    // Make it run out before the booked session.
    await db.query("update passes set expires_at = $2 where id = $1", [id, new Date(NOW.getTime() + DAY).toISOString()]);
    const later = new Date(NOW.getTime() + 2 * DAY);
    expect(await runPassCron(later)).toMatchObject({ expired: 1 });
    expect((await passRow(id)).status).toBe("expired");
    if (booked.ok) expect((await seatRow(booked.bookingId)).status).toBe("confirmed");
    const [next] = await sessions("2026-11-21");
    expect(await bookWithPass({ parentId, passId: id, sessionId: next.id }, { now: later })).toEqual({ ok: false, reason: "pass_not_usable" });
    expect(await runPassCron(later)).toMatchObject({ expired: 0 });
  });

  test("level change keeps existing pass but restricts new bookings", async () => {
    const year9 = await createChild(parentId, { firstName: "Middle", schoolYear: 9, level: "KS3" });
    await signAndApprove(year9);
    const id = await paidPass(year9);
    const [sat] = await sessions("2026-11-14");
    const first = await bookWithPass({ parentId, passId: id, sessionId: sat.id }, opts);
    expect(first.ok).toBe(true);
    await db.query("update children set level = 'GCSE', exam_board = 'AQA', tier = 'Higher' where id = $1", [year9]);
    expect((await passRow(id)).status).toBe("active");
    if (first.ok) expect((await seatRow(first.bookingId)).status).toBe("confirmed");
    const [next] = await sessions("2026-11-21");
    expect(await bookWithPass({ parentId, passId: id, sessionId: next.id }, opts)).toEqual({ ok: false, reason: "level_mismatch" });
    const [sun] = await sessions("2026-11-15");
    expect(await bookWithPass({ parentId, passId: id, sessionId: sun.id }, opts)).toEqual({ ok: false, reason: "level_mismatch" });
  });
});

describe("missing a pass session", () => {
  async function bookedSeat(): Promise<{ passId: string; bookingId: string; startsAt: Date }> {
    const passId = await paidPass(ks3);
    // Outside the 14-day cooling-off from purchase.
    await db.query("update passes set created_at = $2 where id = $1", [passId, new Date(NOW.getTime() - 20 * DAY).toISOString()]);
    const [sat] = await sessions("2026-11-14");
    const r = await bookWithPass({ parentId, passId, sessionId: sat.id }, opts);
    if (!r.ok) throw new Error(r.reason);
    return { passId, bookingId: r.bookingId, startsAt: sat.starts_at };
  }

  test("parent cancel ≥48h returns session", async () => {
    const { passId, bookingId } = await bookedSeat();
    expect(await cancelBookingForParent(parentId, bookingId, opts)).toMatchObject({ ok: true, outcome: "free" });
    expect(await seatRow(bookingId)).toMatchObject({ status: "cancelled", fee_pence: null });
    expect(await liveSeats(passId)).toBe(0);
    expect((await ledger()).filter((l) => l.kind === "credit")).toEqual([]);
    expect(await owed()).toBe(0);
  });

  test("inside 48h the parent must call; outside the cooling-off it is not free", async () => {
    const { bookingId, startsAt } = await bookedSeat();
    const soon = new Date(startsAt.getTime() - 24 * 3600_000);
    expect(await cancelBookingForParent(parentId, bookingId, { now: soon })).toEqual({ ok: false, reason: "call_required", free: false });
  });

  test("late cancel of pass seat returns credit and owes half session value, no ledger credit", async () => {
    const { passId, bookingId, startsAt } = await bookedSeat();
    const soon = new Date(startsAt.getTime() - 24 * 3600_000);
    expect(await recordLateCancellation(bookingId, { now: soon })).toEqual({ ok: true });
    // The session goes back on the pass; half of one session's value (1316) is owed.
    expect(await seatRow(bookingId)).toMatchObject({ status: "late_cancelled", fee_pence: 658, payment_status: "unpaid" });
    expect(await liveSeats(passId)).toBe(0);
    expect((await ledger()).filter((l) => l.kind !== "payment")).toEqual([]);
    expect(await owed()).toBe(658);
  });

  test("late cancel inside the 14 days after buying the pass is free", async () => {
    const passId = await paidPass(ks3);
    const [sat] = await sessions("2026-11-14");
    const r = await bookWithPass({ parentId, passId, sessionId: sat.id }, opts);
    if (!r.ok) throw new Error(r.reason);
    const soon = new Date(sat.starts_at.getTime() - 24 * 3600_000);
    expect(await cancelBookingForParent(parentId, r.bookingId, { now: soon })).toEqual({ ok: false, reason: "call_required", free: true });
    expect(await recordLateCancellation(r.bookingId, { now: soon })).toEqual({ ok: true });
    expect(await seatRow(r.bookingId)).toMatchObject({ status: "cancelled", fee_pence: null });
    expect(await owed()).toBe(0);
  });

  test("a no-show on a pass seat owes the same fee and returns the session", async () => {
    const { passId, bookingId, startsAt } = await bookedSeat();
    expect(await markNoShow(bookingId, { now: new Date(startsAt.getTime() + 3600_000) })).toEqual({ ok: true });
    expect(await seatRow(bookingId)).toMatchObject({ status: "no_show", fee_pence: 658, payment_status: "unpaid" });
    expect(await liveSeats(passId)).toBe(0);
    expect((await ledger()).filter((l) => l.kind !== "payment")).toEqual([]);
    expect(await owed()).toBe(658);
  });

  test("tutor cancel and group cancel return the session with no fee and no credit", async () => {
    const { passId, bookingId } = await bookedSeat();
    expect(await tutorCancel(bookingId, true, opts)).toEqual({ ok: true });
    expect(await seatRow(bookingId)).toMatchObject({ status: "cancelled", fee_pence: null });
    expect(await liveSeats(passId)).toBe(0);
    const [next] = await sessions("2026-11-21");
    const again = await bookWithPass({ parentId, passId, sessionId: next.id }, opts);
    if (!again.ok) throw new Error(again.reason);
    expect(await cancelSession(next.id, true, opts)).toEqual({ ok: true });
    expect(await seatRow(again.bookingId)).toMatchObject({ status: "cancelled", fee_pence: null });
    expect(await liveSeats(passId)).toBe(0);
    expect((await ledger()).filter((l) => l.kind !== "payment")).toEqual([]);
    expect(await owed()).toBe(0);
  });
});

describe("cancelling a pass", () => {
  test("cancel pass within 14 days → unused value as credit", async () => {
    const id = await paidPass(ks3);
    const [sat] = await sessions("2026-11-14");
    const [taken] = await sessions("2026-11-07");
    expect((await bookWithPass({ parentId, passId: id, sessionId: sat.id }, opts)).ok).toBe(true);
    // One session already attended: its value stays used.
    await db.query(
      `insert into bookings (parent_id, child_id, kind, location, starts_at, ends_at, busy_until, group_session_id, status, price_pence, payment_status, pass_id)
       select $1, $2, 'group', 'group_venue', starts_at, ends_at, ends_at, id, 'attended', 1316, 'paid', $3 from group_sessions where id = $4`,
      [parentId, ks3, id, taken.id],
    );
    const later = new Date(NOW.getTime() + 10 * DAY);
    expect(await cancelPassForParent(parentId, id, { now: later })).toEqual({ ok: true, creditPence: 5 * 1316 });
    expect((await passRow(id)).status).toBe("cancelled");
    // The booked future session is cancelled with the pass.
    expect(await liveSeats(id)).toBe(1);
    expect((await ledger()).filter((l) => l.kind === "credit")).toEqual([
      expect.objectContaining({ kind: "credit", amount_pence: 6580, pass_id: id, booking_id: null }),
    ]);
  });

  test("an unpaid pass is cancelled with nothing owed and no credit", async () => {
    const id = await buy(ks3);
    expect(await cancelPassForParent(parentId, id, opts)).toEqual({ ok: true, creditPence: 0 });
    expect((await passRow(id)).status).toBe("cancelled");
    expect(await ledger()).toEqual([]);
  });

  test("after 14 days refused", async () => {
    const id = await paidPass(ks3);
    const r = await cancelPassForParent(parentId, id, { now: new Date(NOW.getTime() + 15 * DAY) });
    expect(r).toEqual({ ok: false, reason: "too_late", message: "Unused sessions can't be refunded — please contact Study Lab Co." });
    expect((await passRow(id)).status).toBe("active");
    const other = (await createUser()).id;
    expect(await cancelPassForParent(other, id, opts)).toMatchObject({ ok: false, reason: "not_found" });
  });

  test("the tutor can convert a pass to credit at any time", async () => {
    const id = await paidPass(gcse, 10);
    expect((await bookWithPass({ parentId, passId: id, sundayDate: "2026-11-15" }, opts)).ok).toBe(true);
    expect(await convertPassToCredit(id, { now: new Date(NOW.getTime() + 60 * DAY) })).toEqual({ ok: true });
    expect((await passRow(id)).status).toBe("cancelled");
    // The Sunday seats were in the past by then, so 8 sessions are unused.
    expect((await ledger()).filter((l) => l.kind === "credit").map((l) => l.amount_pence)).toEqual([8 * 1620]);
    expect((await convertPassToCredit(id, opts)).ok).toBe(false);
  });
});

describe("pass cron", () => {
  test("awaiting-payment reminder once after 48 hours", async () => {
    await buy(ks3);
    testOutbox.length = 0;
    expect(await runPassCron(new Date(NOW.getTime() + 47 * 3600_000))).toMatchObject({ reminders: 0 });
    expect(await runPassCron(new Date(NOW.getTime() + 49 * 3600_000))).toMatchObject({ reminders: 1 });
    expect(await runPassCron(new Date(NOW.getTime() + 73 * 3600_000))).toMatchObject({ reminders: 0 });
    expect(testOutbox.filter((e) => e.template === "pass_payment_reminder")).toHaveLength(1);
  });
});
