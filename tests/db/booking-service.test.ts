/**
 * Booking service against the local Supabase stack (PostgREST + Postgres).
 * `now` is pinned so slot windows are deterministic: Sunday 1 Nov 2026 09:00 GMT.
 * Monday 2 Nov 17:00 is the first term-time tutor's-place slot >= 24 h ahead;
 * Sunday 8 Nov 10:30 is a home-visit slot.
 */
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import {
  createBooking,
  createGroupBooking,
  createSundayBundle,
  getAvailableSlots,
} from "@/lib/booking/service";
import { closeDb, createChild, createUser, db, resetData } from "./setup";

const NOW = new Date("2026-11-01T09:00:00Z");
const opts = { now: NOW };
const MON_17 = new Date("2026-11-02T17:00:00Z");
const SUN_1030 = new Date("2026-11-08T10:30:00Z");

let parentId: string;
let childId: string;

async function signAgreement(child: string) {
  await db.query(
    `insert into agreements (child_id, policy_version, emergency_contact_name, emergency_contact_phone,
                             consent_contact, signed_name)
     values ($1, '2026-11-01', 'Gran', '01632960123', true, 'Pat Parent')`,
    [child],
  );
}

async function approve(child: string) {
  await db.query(
    "insert into student_status (child_id, assessment_completed_at, approved_at) values ($1, now(), now())",
    [child],
  );
}

async function booking(id: string) {
  const { rows } = await db.query(
    `select kind::text, location::text, status::text, price_pence, travel_fee_pence, starts_at, ends_at,
            busy_until, home_address, home_postcode, parent_id, child_id, bundle_id, block_booking_id,
            payment_reference
       from bookings where id = $1`,
    [id],
  );
  return rows[0];
}

const count = async (sql: string, values: unknown[] = []) =>
  (await db.query<{ n: number }>(`select count(*)::int as n from ${sql}`, values)).rows[0].n;

beforeEach(async () => {
  await resetData();
  parentId = (await createUser()).id;
  childId = await createChild(parentId);
  await signAgreement(childId);
});

afterAll(closeDb);

const assessmentAt = (startsAt: Date, over: Record<string, unknown> = {}) => ({
  parentId,
  childId,
  kind: "assessment" as const,
  location: "tutor_place" as const,
  startsAt,
  coolingOff: true,
  ...over,
});

describe("getAvailableSlots", () => {
  test("offers Monday term slots and hides booked ones", async () => {
    const before = await getAvailableSlots(childId, "assessment", "tutor_place", "2026-11-02", "2026-11-02", opts);
    expect(before.map((s) => s.startsAt.toISOString())).toEqual([
      "2026-11-02T17:00:00.000Z",
      "2026-11-02T18:00:00.000Z",
      "2026-11-02T19:00:00.000Z",
    ]);
    expect(await createBooking(assessmentAt(MON_17), opts)).toMatchObject({ ok: true });
    const after = await getAvailableSlots(childId, "one_to_one", "tutor_place", "2026-11-02", "2026-11-02", opts);
    expect(after.map((s) => s.startsAt.toISOString())).toEqual(["2026-11-02T18:00:00.000Z", "2026-11-02T19:00:00.000Z"]);
  });
});

describe("createBooking", () => {
  test("createBooking returns slot_taken on exclusion violation", async () => {
    const other = await createUser();
    const otherChild = await createChild(other.id, { firstName: "Racer" });
    const result = await createBooking(assessmentAt(MON_17), {
      now: NOW,
      // The other parent's insert lands after our slot check passed.
      afterSlotCheck: async () => {
        await db.query(
          `insert into bookings (parent_id, child_id, kind, location, starts_at, ends_at, busy_until,
                                 status, price_pence)
           values ($1, $2, 'assessment', 'tutor_place', $3, $4, $4, 'confirmed', 1000)`,
          [other.id, otherChild, MON_17, new Date(MON_17.getTime() + 3600_000)],
        );
      },
    });
    expect(result).toEqual({ ok: false, reason: "slot_taken" });
    expect(await count("bookings where parent_id = $1", [parentId])).toBe(0);
    expect(await count("consents where profile_id = $1", [parentId])).toBe(0);
  });

  test("taken slot is rejected before insert", async () => {
    expect(await createBooking(assessmentAt(MON_17), opts)).toMatchObject({ ok: true });
    const second = await createChild(parentId, { firstName: "Twin" });
    await signAgreement(second);
    expect(await createBooking(assessmentAt(MON_17, { childId: second }), opts)).toEqual({
      ok: false,
      reason: "slot_taken",
    });
  });

  test("home visit stored pending with busy_until +30m and travel 500", async () => {
    const r = await createBooking(
      assessmentAt(SUN_1030, { location: "home_visit", homeAddress: " 1 Test Street ", postcode: "bb1 1aa" }),
      opts,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const b = await booking(r.bookingId);
    expect(b).toMatchObject({
      kind: "assessment",
      location: "home_visit",
      status: "pending",
      price_pence: 1000,
      travel_fee_pence: 500,
      home_address: "1 Test Street",
      home_postcode: "BB1 1AA",
      parent_id: parentId,
      child_id: childId,
    });
    expect(b.ends_at.toISOString()).toBe("2026-11-08T11:30:00.000Z");
    expect(b.busy_until.toISOString()).toBe("2026-11-08T12:00:00.000Z");
    expect(b.payment_reference).toMatch(/^SLC-\d{4,}$/);
  });

  test("home visit needs an address and an allowed postcode", async () => {
    const at = { location: "home_visit", postcode: "BB3 1AA", homeAddress: "1 Test Street" };
    expect(await createBooking(assessmentAt(SUN_1030, at), opts)).toEqual({ ok: false, reason: "postcode_not_allowed" });
    expect(await createBooking(assessmentAt(SUN_1030, { ...at, postcode: "BB1 1AA", homeAddress: "  " }), opts)).toEqual({
      ok: false,
      reason: "address_required",
    });
  });

  test("assessment for unapproved child ok; one_to_one returns not_approved", async () => {
    const a = await createBooking(assessmentAt(MON_17), opts);
    expect(a.ok).toBe(true);
    if (a.ok) expect(await booking(a.bookingId)).toMatchObject({ status: "confirmed", price_pence: 1000, travel_fee_pence: 0 });
    const o = await createBooking(assessmentAt(new Date("2026-11-02T18:00:00Z"), { kind: "one_to_one" }), opts);
    expect(o).toEqual({ ok: false, reason: "not_approved" });
  });

  test("second assessment or assessment after approval -> assessment_already_booked", async () => {
    expect((await createBooking(assessmentAt(MON_17), opts)).ok).toBe(true);
    const later = new Date("2026-11-02T18:00:00Z");
    expect(await createBooking(assessmentAt(later), opts)).toEqual({ ok: false, reason: "assessment_already_booked" });

    const approved = await createChild(parentId, { firstName: "Done" });
    await signAgreement(approved);
    await approve(approved);
    expect(await createBooking(assessmentAt(later, { childId: approved }), opts)).toEqual({
      ok: false,
      reason: "assessment_already_booked",
    });
  });

  test("price snapshot stored on booking", async () => {
    await approve(childId);
    const r = await createBooking(assessmentAt(MON_17, { kind: "one_to_one" }), opts);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    try {
      await db.query("update settings set price_one_to_one_pence = 9900 where id = 1");
      expect(await booking(r.bookingId)).toMatchObject({ kind: "one_to_one", price_pence: 2500, travel_fee_pence: 0 });
    } finally {
      await db.query("update settings set price_one_to_one_pence = 2500 where id = 1");
    }
    const { rows } = await db.query(
      "select kind, policy_version, granted, booking_id from consents where profile_id = $1",
      [parentId],
    );
    expect(rows).toEqual([{ kind: "cooling_off", policy_version: "2026-11-01", granted: true, booking_id: r.bookingId }]);
  });

  test("online is refused while switched off; group_venue is not a lesson location", async () => {
    await approve(childId);
    const oneToOne = { kind: "one_to_one" };
    expect(await createBooking(assessmentAt(MON_17, { ...oneToOne, location: "online" }), opts)).toEqual({
      ok: false,
      reason: "online_disabled",
    });
    expect(await createBooking(assessmentAt(MON_17, { ...oneToOne, location: "group_venue" }), opts)).toEqual({
      ok: false,
      reason: "location_disabled",
    });
  });

  test("cooling-off consent is required", async () => {
    expect(await createBooking(assessmentAt(MON_17, { coolingOff: false }), opts)).toEqual({
      ok: false,
      reason: "cooling_off_required",
    });
    expect(await count("bookings")).toBe(0);
  });

  test("another parent's child -> child_not_found; missing agreement -> agreement_missing", async () => {
    const other = await createUser();
    expect(await createBooking(assessmentAt(MON_17, { parentId: other.id }), opts)).toEqual({
      ok: false,
      reason: "child_not_found",
    });
    const unsigned = await createChild(parentId, { firstName: "New" });
    expect(await createBooking(assessmentAt(MON_17, { childId: unsigned }), opts)).toEqual({
      ok: false,
      reason: "agreement_missing",
    });
  });

  test("money owed blocks new bookings", async () => {
    await db.query(
      `insert into bookings (parent_id, child_id, kind, location, starts_at, ends_at, busy_until, status, price_pence)
       values ($1, $2, 'assessment', 'tutor_place', '2026-10-20T17:00Z', '2026-10-20T18:00Z', '2026-10-20T18:00Z',
               'attended', 1000)`,
      [parentId, childId],
    );
    await approve(childId);
    expect(await createBooking(assessmentAt(MON_17, { kind: "one_to_one" }), opts)).toEqual({
      ok: false,
      reason: "money_owed",
    });
  });
});

describe("KS3 levels (v2)", () => {
  async function ks3Child(schoolYear: 7 | 8 | 9 = 8, approved = true) {
    const id = await createChild(parentId, { firstName: "Kay", schoolYear, level: "KS3" });
    await signAgreement(id);
    if (approved) await approve(id);
    return id;
  }

  test("KS3 one_to_one stored price 2000", async () => {
    const ks3 = await ks3Child();
    const r = await createBooking(assessmentAt(MON_17, { kind: "one_to_one", childId: ks3 }), opts);
    expect(r.ok).toBe(true);
    if (r.ok) expect(await booking(r.bookingId)).toMatchObject({ kind: "one_to_one", price_pence: 2000, travel_fee_pence: 0 });
    const home = await createBooking(
      assessmentAt(SUN_1030, { kind: "one_to_one", childId: ks3, location: "home_visit", homeAddress: "1 Road", postcode: "BB1 1AA" }),
      opts,
    );
    expect(home.ok).toBe(true);
    if (home.ok) expect(await booking(home.bookingId)).toMatchObject({ price_pence: 2000, travel_fee_pence: 500 });
  });

  test("Year 7-8 assessment is the KS3 price; Year 9 KS3 sits the GCSE assessment at 1000", async () => {
    const y8 = await ks3Child(8, false);
    const a = await createBooking(assessmentAt(MON_17, { childId: y8 }), opts);
    expect(a.ok).toBe(true);
    if (a.ok) expect(await booking(a.bookingId)).toMatchObject({ kind: "assessment", price_pence: 750 });
    const y9 = await ks3Child(9, false);
    const b = await createBooking(assessmentAt(new Date("2026-11-02T18:00:00Z"), { childId: y9 }), opts);
    expect(b.ok).toBe(true);
    if (b.ok) expect(await booking(b.bookingId)).toMatchObject({ kind: "assessment", price_pence: 1000 });
  });

  test("KS3 child cannot book a GCSE group session (level_mismatch)", async () => {
    const ks3 = await ks3Child();
    await db.query("select public.ensure_group_sessions('2027-03-31')");
    const { rows } = await db.query<{ id: string }>(
      `select id from group_sessions where level = 'GCSE' and (starts_at at time zone 'Europe/London')::date = '2026-11-08'
        order by starts_at limit 1`,
    );
    expect(await createGroupBooking({ parentId, childId: ks3, coolingOff: true, sessionId: rows[0].id }, opts)).toEqual({
      ok: false,
      reason: "level_mismatch",
    });
    expect(await count("bookings where child_id = $1", [ks3])).toBe(0);
  });

  test("changing a Year 9 child's level keeps existing bookings; new bookings follow the new level", async () => {
    const y9 = await ks3Child(9);
    await db.query("select public.ensure_group_sessions('2027-03-31')");
    const day = async (d: string) =>
      (await db.query<{ id: string }>(
        "select id from group_sessions where (starts_at at time zone 'Europe/London')::date = $1 order by starts_at limit 1",
        [d],
      )).rows[0].id;
    const sat = await day("2026-11-07");
    const sun = await day("2026-11-08");
    const g = { parentId, childId: y9, coolingOff: true };
    const kept = await createGroupBooking({ ...g, sessionId: sat }, opts);
    expect(kept.ok).toBe(true);
    const lesson = await createBooking(assessmentAt(MON_17, { kind: "one_to_one", childId: y9 }), opts);
    expect(lesson.ok).toBe(true);

    await db.query("update children set level = 'GCSE', exam_board = 'AQA', tier = 'Higher' where id = $1", [y9]);
    if (kept.ok) expect(await booking(kept.bookingId)).toMatchObject({ status: "confirmed", price_pence: 1400 });
    if (lesson.ok) expect(await booking(lesson.bookingId)).toMatchObject({ status: "confirmed", price_pence: 2000 });

    const next = await createGroupBooking({ ...g, sessionId: await day("2026-11-14") }, opts);
    expect(next).toEqual({ ok: false, reason: "level_mismatch" });
    const gcse = await createGroupBooking({ ...g, sessionId: sun }, opts);
    expect(gcse.ok).toBe(true);
    if (gcse.ok) expect(await booking(gcse.bookingId)).toMatchObject({ price_pence: 1800 });
    const later = await createBooking(assessmentAt(new Date("2026-11-02T18:00:00Z"), { kind: "one_to_one", childId: y9 }), opts);
    expect(later.ok).toBe(true);
    if (later.ok) expect(await booking(later.bookingId)).toMatchObject({ price_pence: 2500 });
  });
});

describe("group bookings", () => {
  async function sessions(dateIso: string) {
    const { rows } = await db.query<{ id: string }>(
      `select gs.id from group_sessions gs where (gs.starts_at at time zone 'Europe/London')::date = $1
        order by gs.starts_at`,
      [dateIso],
    );
    return rows.map((r) => r.id);
  }

  let ks3: string;
  beforeEach(async () => {
    await approve(childId);
    // The Saturday group is KS3 only; the default child (Year 10) is GCSE.
    ks3 = await createChild(parentId, { firstName: "Junior", schoolYear: 8, level: "KS3" });
    await signAgreement(ks3);
    await approve(ks3);
    await db.query("select public.ensure_group_sessions('2027-03-31')");
  });

  const group = <T extends object>(over: T) => ({ parentId, childId, coolingOff: true, ...over });

  test("a single seat is charged the session's own price, not the global group price (R17)", async () => {
    const [sat] = await sessions("2026-11-07");
    await db.query("update group_sessions set price_pence = 1250 where id = $1", [sat]);
    const r = await createGroupBooking(group({ sessionId: sat, childId: ks3 }), opts);
    expect(r.ok).toBe(true);
    if (r.ok) expect(await booking(r.bookingId)).toMatchObject({ kind: "group", price_pence: 1250 });
  });

  test("single group seat at the group price; second seat -> already_booked", async () => {
    const [sat] = await sessions("2026-11-07");
    const r = await createGroupBooking(group({ sessionId: sat, childId: ks3 }), opts);
    expect(r.ok).toBe(true);
    if (r.ok) expect(await booking(r.bookingId)).toMatchObject({ kind: "group", status: "confirmed", price_pence: 1400 });
    expect(await createGroupBooking(group({ sessionId: sat, childId: ks3 }), opts)).toEqual({ ok: false, reason: "already_booked" });
    expect(await count("consents where booking_id is not null")).toBe(1);
  });

  test("past, too-soon or cancelled sessions are refused; full -> session_full", async () => {
    const [today] = await sessions("2026-11-01"); // 08:15, before NOW
    expect(await createGroupBooking(group({ sessionId: today }), opts)).toEqual({ ok: false, reason: "session_unavailable" });
    const [sat] = await sessions("2026-11-07");
    await db.query("update group_sessions set status = 'cancelled' where id = $1", [sat]);
    expect(await createGroupBooking(group({ sessionId: sat, childId: ks3 }), opts)).toEqual({ ok: false, reason: "session_unavailable" });
    const [next] = await sessions("2026-11-14");
    await db.query("update group_sessions set capacity = 1 where id = $1", [next]);
    const other = await createChild(parentId, { firstName: "Other", schoolYear: 8, level: "KS3" });
    await signAgreement(other);
    await approve(other);
    expect((await createGroupBooking(group({ sessionId: next, childId: other }), opts)).ok).toBe(true);
    expect(await createGroupBooking(group({ sessionId: next, childId: ks3 }), opts)).toEqual({ ok: false, reason: "session_full" });
  });

  test("a GCSE child cannot book a KS3 session, and a KS3 child cannot book a GCSE one (level_mismatch)", async () => {
    const [sat] = await sessions("2026-11-07"); // Saturday group is KS3
    const [sun] = await sessions("2026-11-08"); // Sunday groups are GCSE
    expect(await createGroupBooking(group({ sessionId: sat }), opts)).toEqual({ ok: false, reason: "level_mismatch" });
    expect(await createGroupBooking(group({ sessionId: sun, childId: ks3 }), opts)).toEqual({ ok: false, reason: "level_mismatch" });
    expect(await count("bookings where kind = 'group'")).toBe(0);
    const ok = await createGroupBooking(group({ sessionId: sat, childId: ks3 }), opts);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(await booking(ok.bookingId)).toMatchObject({ kind: "group", price_pence: 1400 });
  });

  test("a KS3 child cannot book the (GCSE) Sunday bundle", async () => {
    expect(await createSundayBundle(group({ date: "2026-11-08", childId: ks3 }), opts)).toEqual({
      ok: false,
      reason: "level_mismatch",
    });
  });

  test("unapproved child cannot book groups", async () => {
    const fresh = await createChild(parentId, { firstName: "Fresh" });
    await signAgreement(fresh);
    const [sat] = await sessions("2026-11-07");
    expect(await createGroupBooking(group({ sessionId: sat, childId: fresh }), opts)).toEqual({
      ok: false,
      reason: "assessment_required",
    });
  });

  test("Sunday bundle books both sessions with one bundle id", async () => {
    const r = await createSundayBundle(group({ date: "2026-11-08" }), opts);
    expect(r.ok).toBe(true);
    const { rows } = await db.query(
      "select bundle_id, price_pence, group_session_id from bookings where parent_id = $1 order by starts_at",
      [parentId],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].bundle_id).not.toBeNull();
    expect(rows[1].bundle_id).toBe(rows[0].bundle_id);
    expect(rows.map((x) => x.price_pence)).toEqual([1500, 1500]);
    expect(rows.map((x) => x.group_session_id)).toEqual(await sessions("2026-11-08"));
  });

  test("Sunday bundle is all-or-nothing", async () => {
    const [, second] = await sessions("2026-11-08");
    await db.query("update group_sessions set capacity = 1 where id = $1", [second]);
    const other = await createChild(parentId, { firstName: "Other" });
    await signAgreement(other);
    await approve(other);
    expect((await createGroupBooking(group({ sessionId: second, childId: other }), opts)).ok).toBe(true);
    expect(await createSundayBundle(group({ date: "2026-11-08" }), opts)).toEqual({ ok: false, reason: "session_full" });
    expect(await count("bookings where child_id = $1", [childId])).toBe(0);
    expect(await count("consents where profile_id = $1", [parentId])).toBe(1);
  });

  test("a seat taken after the checks: the bundle keeps no seats", async () => {
    const [, second] = await sessions("2026-11-08");
    await db.query("update group_sessions set capacity = 1 where id = $1", [second]);
    const other = await createUser();
    const otherChild = await createChild(other.id, { firstName: "Racer" });
    const r = await createSundayBundle(group({ date: "2026-11-08" }), {
      now: NOW,
      // Another family takes the last seat of the second session after the checks, before our seats.
      beforeSeats: async () => {
        await db.query("select public.reserve_group_seat($1, $2, $3, 1800)", [second, other.id, otherChild]);
      },
    });
    expect(r).toEqual({ ok: false, reason: "session_full" });
    expect(await count("bookings where parent_id = $1", [parentId])).toBe(0);
  });

  test("unexpected seat error rolls back seats, then rethrows", async () => {
    const [, second] = await sessions("2026-11-08");
    const r = createSundayBundle(group({ date: "2026-11-08" }), {
      now: NOW,
      // Makes the second seat insert fail with an unmapped error (23514 check violation).
      beforeSeats: async () => {
        await db.query(
          `alter table bookings add constraint test_no_second
             check (group_session_id is distinct from '${second}'::uuid) not valid`,
        );
      },
    });
    try {
      await expect(r).rejects.toThrow(/Could not reserve a seat/);
      expect(await count("bookings where parent_id = $1", [parentId])).toBe(0);
      expect(await count("consents where profile_id = $1", [parentId])).toBe(0);
    } finally {
      await db.query("alter table bookings drop constraint if exists test_no_second");
    }
  });
});
