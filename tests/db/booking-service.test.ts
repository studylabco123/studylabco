/**
 * Booking service against the local Supabase stack (PostgREST + Postgres).
 * `now` is pinned so slot windows are deterministic: Sunday 1 Nov 2026 09:00 GMT.
 * Monday 2 Nov 17:00 is the first term-time tutor's-place slot >= 24 h ahead;
 * Sunday 8 Nov 10:30 is a home-visit slot.
 */
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import {
  createBlockBooking,
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

  test("a GCSE child cannot book a KS3 Saturday block or Sunday-bundle with a KS3 child", async () => {
    expect(await createBlockBooking(group({ product: "saturday", weeks: 6, firstDate: "2026-11-07" }), opts)).toEqual({
      ok: false,
      reason: "level_mismatch",
    });
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

  test("Saturday 6-week block: held block row and six seats", async () => {
    const r = await createBlockBooking(group({ product: "saturday", weeks: 6, firstDate: "2026-11-07", childId: ks3 }), opts);
    expect(r.ok).toBe(true);
    const { rows: blocks } = await db.query(
      "select id, product, weeks, price_pence, status, hold_expires_at from block_bookings where parent_id = $1",
      [parentId],
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ product: "saturday", weeks: 6, price_pence: 10200, status: "held" });
    expect(blocks[0].hold_expires_at.getTime()).toBe(NOW.getTime() + 72 * 3600_000);
    const { rows } = await db.query(
      "select price_pence, block_booking_id, (starts_at at time zone 'Europe/London')::date::text as d from bookings where parent_id = $1 order by starts_at",
      [parentId],
    );
    expect(rows.map((x) => x.d)).toEqual(["2026-11-07", "2026-11-14", "2026-11-21", "2026-11-28", "2026-12-05", "2026-12-12"]);
    expect(rows.every((x) => x.block_booking_id === blocks[0].id && x.price_pence === 1700)).toBe(true);
  });

  test("block over a full week is rejected naming the date, nothing kept", async () => {
    const [full] = await sessions("2026-11-21");
    await db.query("update group_sessions set capacity = 1 where id = $1", [full]);
    const other = await createChild(parentId, { firstName: "Other", schoolYear: 8, level: "KS3" });
    await signAgreement(other);
    await approve(other);
    expect((await createGroupBooking(group({ sessionId: full, childId: other }), opts)).ok).toBe(true);
    expect(await createBlockBooking(group({ product: "saturday", weeks: 6, firstDate: "2026-11-07", childId: ks3 }), opts)).toEqual({
      ok: false,
      reason: "session_full",
      fullDate: "2026-11-21",
    });
    expect(await count("block_bookings")).toBe(0);
    expect(await count("bookings where child_id = $1", [ks3])).toBe(0);
  });

  test("week filled after the block row exists: no seats and no block row remain", async () => {
    const [week3] = await sessions("2026-11-21");
    await db.query("update group_sessions set capacity = 1 where id = $1", [week3]);
    const other = await createUser();
    const otherChild = await createChild(other.id, { firstName: "Racer", schoolYear: 8, level: "KS3" });
    const r = await createBlockBooking(group({ product: "saturday", weeks: 6, firstDate: "2026-11-07", childId: ks3 }), {
      now: NOW,
      // Another family takes the last week-3 seat after planning, before our seats.
      beforeSeats: async () => {
        expect(await count("block_bookings")).toBe(1);
        await db.query("select public.reserve_group_seat($1, $2, $3, 1800)", [week3, other.id, otherChild]);
      },
    });
    expect(r).toEqual({ ok: false, reason: "session_full", fullDate: "2026-11-21" });
    expect(await count("block_bookings")).toBe(0);
    expect(await count("bookings where parent_id = $1", [parentId])).toBe(0);
  });

  test("unexpected seat error rolls back seats and block row, then rethrows", async () => {
    const [week2] = await sessions("2026-11-14");
    const r = createBlockBooking(group({ product: "saturday", weeks: 6, firstDate: "2026-11-07", childId: ks3 }), {
      now: NOW,
      // Makes the week-2 seat insert fail with an unmapped error (23514 check violation).
      beforeSeats: async () => {
        await db.query(
          `alter table bookings add constraint test_no_week2
             check (group_session_id is distinct from '${week2}'::uuid) not valid`,
        );
      },
    });
    try {
      await expect(r).rejects.toThrow(/Could not reserve a seat/);
      expect(await count("block_bookings")).toBe(0);
      expect(await count("bookings where parent_id = $1", [parentId])).toBe(0);
      expect(await count("consents where profile_id = $1", [parentId])).toBe(0);
    } finally {
      await db.query("alter table bookings drop constraint if exists test_no_week2");
    }
  });

  test("Sunday bundle 6-week block takes 12 seats", async () => {
    const r = await createBlockBooking(group({ product: "sunday_bundle", weeks: 6, firstDate: "2026-11-08" }), opts);
    expect(r.ok).toBe(true);
    expect(await count("bookings where child_id = $1 and block_booking_id is not null", [childId])).toBe(12);
    const { rows } = await db.query<{ s: number }>(
      "select sum(price_pence)::int as s from bookings where child_id = $1",
      [childId],
    );
    expect(rows[0].s).toBe(17100);
  });
});
