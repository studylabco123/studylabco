import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { asAnon, asUser, closeDb, createChild, createUser, db, resetData } from "./setup";

// 2026-11-02 is a term-time Monday (GMT, so London = UTC).
// 2026-11-08 is a Sunday.
let parentId: string;
let childId: string;

async function insertBooking(b: {
  kind?: string;
  location?: string;
  startsAt: string;
  endsAt: string;
  busyUntil?: string;
  status?: string;
  groupSessionId?: string;
}) {
  const { rows } = await db.query<{ id: string; payment_reference: string }>(
    `insert into bookings
       (parent_id, child_id, kind, location, starts_at, ends_at, busy_until,
        group_session_id, status, price_pence, travel_fee_pence)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 2500, 0)
     returning id, payment_reference`,
    [
      parentId,
      childId,
      b.kind ?? "one_to_one",
      b.location ?? "tutor_place",
      b.startsAt,
      b.endsAt,
      b.busyUntil ?? b.endsAt,
      b.groupSessionId ?? null,
      b.status ?? "confirmed",
    ],
  );
  return rows[0];
}

async function errorCode(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (err) {
    return (err as { code?: string }).code;
  }
}

beforeEach(async () => {
  await resetData();
  parentId = (await createUser()).id;
  childId = await createChild(parentId);
});

afterAll(closeDb);

describe("booking constraints", () => {
  test("rejects overlapping 1-to-1 bookings", async () => {
    await insertBooking({ startsAt: "2026-11-02T17:00Z", endsAt: "2026-11-02T18:00Z" });
    const code = await errorCode(
      insertBooking({ startsAt: "2026-11-02T17:30Z", endsAt: "2026-11-02T18:30Z" }),
    );
    expect(code).toBe("23P01");
  });

  test("back-to-back bookings are allowed", async () => {
    await insertBooking({ startsAt: "2026-11-02T17:00Z", endsAt: "2026-11-02T18:00Z" });
    await expect(
      insertBooking({ startsAt: "2026-11-02T18:00Z", endsAt: "2026-11-02T19:00Z" }),
    ).resolves.toBeDefined();
  });

  test("home visit buffer blocks next slot", async () => {
    await insertBooking({
      location: "home_visit",
      status: "pending",
      startsAt: "2026-11-08T10:30Z",
      endsAt: "2026-11-08T11:30Z",
      busyUntil: "2026-11-08T12:00Z",
    });
    const code = await errorCode(
      insertBooking({ startsAt: "2026-11-08T11:30Z", endsAt: "2026-11-08T12:30Z" }),
    );
    expect(code).toBe("23P01");
  });

  test("cancelled booking frees the slot", async () => {
    const first = await insertBooking({
      startsAt: "2026-11-02T17:00Z",
      endsAt: "2026-11-02T18:00Z",
    });
    await db.query(
      "update bookings set status = 'cancelled', cancelled_at = now() where id = $1",
      [first.id],
    );
    await expect(
      insertBooking({ startsAt: "2026-11-02T17:30Z", endsAt: "2026-11-02T18:30Z" }),
    ).resolves.toBeDefined();
  });

  test("child cannot hold two seats in one group session", async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into group_sessions
         (title, starts_at, ends_at, capacity, price_pence, is_online, status)
       values ('Saturday GCSE Science Group', '2026-11-07T08:15Z', '2026-11-07T09:15Z',
               15, 1800, false, 'scheduled')
       returning id`,
    );
    const session = {
      kind: "group",
      location: "group_venue",
      startsAt: "2026-11-07T08:15Z",
      endsAt: "2026-11-07T09:15Z",
      groupSessionId: rows[0].id,
    };
    await insertBooking(session);
    expect(await errorCode(insertBooking(session))).toBe("23505");
  });

  test("payment reference format", async () => {
    const first = await insertBooking({
      startsAt: "2026-11-02T17:00Z",
      endsAt: "2026-11-02T18:00Z",
    });
    expect(first.payment_reference).toMatch(/^SLC-\d{4,}$/);
  });

  test("block bookings get a payment reference too", async () => {
    const { rows } = await db.query<{ payment_reference: string }>(
      `insert into block_bookings (parent_id, child_id, product, weeks, price_pence, hold_expires_at, status)
       values ($1, $2, 'saturday', 6, 10200, now() + interval '72 hours', 'held')
       returning payment_reference`,
      [parentId, childId],
    );
    expect(rows[0].payment_reference).toMatch(/^SLC-\d{4,}$/);
  });
});

describe("seed", () => {
  test("seed: holiday Monday rule is 07:00–22:00", async () => {
    const { rows } = await db.query(
      `select start_time::text as start, end_time::text as end, kinds::text[] as kinds,
              locations::text[] as locations
         from availability_rules where period = 'holiday' and weekday = 1`,
    );
    expect(rows).toEqual([
      {
        start: "07:00:00",
        end: "22:00:00",
        kinds: ["assessment", "one_to_one"],
        locations: ["tutor_place", "online"],
      },
    ]);
  });

  test("seed: Sunday rules allow home visits 10:30–17:30 in term and holiday", async () => {
    const { rows } = await db.query(
      `select period::text, start_time::text as start, end_time::text as end,
              locations::text[] as locations
         from availability_rules where weekday = 0 order by period`,
    );
    expect(rows).toEqual([
      { period: "holiday", start: "10:30:00", end: "17:30:00", locations: ["tutor_place", "home_visit", "online"] },
      { period: "term", start: "10:30:00", end: "17:30:00", locations: ["tutor_place", "home_visit", "online"] },
    ]);
  });

  test("seed: 12 availability rules (term + holiday, Mon–Fri + Sunday)", async () => {
    const { rows } = await db.query("select count(*)::int as n from availability_rules");
    expect(rows[0].n).toBe(12);
  });

  test("seed: 9 term periods", async () => {
    const { rows } = await db.query<{ starts_on: string; ends_on: string }>(
      `select starts_on::text, ends_on::text from term_periods order by starts_on`,
    );
    expect(rows).toHaveLength(9);
    expect(rows[0]).toEqual({ starts_on: "2026-09-01", ends_on: "2026-10-23" });
    expect(rows[8]).toEqual({ starts_on: "2027-06-07", ends_on: "2027-07-22" });
  });

  test("seed: online disabled", async () => {
    const { rows } = await db.query("select * from settings");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      online_enabled: false,
      home_visits_enabled: true,
      tutor_place_enabled: true,
    });
  });

  test("seed: launch prices and policy values", async () => {
    const { rows } = await db.query("select * from settings where id = 1");
    expect(rows[0]).toMatchObject({
      price_assessment_pence: 1000,
      price_one_to_one_pence: 2500,
      price_group_pence: 1800,
      price_sunday_bundle_pence: 3000,
      travel_fee_pence: 500,
      block_prices: {
        saturday: { "6": 10200, "10": 16200 },
        sunday_bundle: { "6": 17100, "10": 27000 },
      },
      cancellation_notice_hours: 48,
      booking_window_days: 28,
      min_notice_hours: 24,
      default_group_capacity: 15,
      home_visit_buffer_minutes: 30,
      allowed_postcode_districts: ["BB1", "BB2"],
      flag_threshold: 2,
    });
  });

  test("seed: settings_private has a random calendar feed token", async () => {
    const { rows } = await db.query("select calendar_feed_token from settings_private where id = 1");
    expect(rows[0].calendar_feed_token).toMatch(/^[0-9a-f]{32,}$/);
  });

  test("seed: default whole-day blocks are London midnight to midnight", async () => {
    const { rows } = await db.query<{ starts_at: Date; ends_at: Date }>(
      `select starts_at, ends_at from blocked_times where is_default order by starts_at`,
    );
    expect(rows).toHaveLength(7);
    // 25 Dec 2026 is GMT: London midnight = 00:00Z.
    expect(rows[0].starts_at.toISOString()).toBe("2026-12-25T00:00:00.000Z");
    expect(rows[0].ends_at.toISOString()).toBe("2026-12-26T00:00:00.000Z");
    // 17 May 2027 is BST: London midnight = 23:00Z the day before.
    expect(rows[5].starts_at.toISOString()).toBe("2027-05-16T23:00:00.000Z");
    expect(rows[6].ends_at.toISOString()).toBe("2027-05-18T23:00:00.000Z");
  });

  test("seed: three group series, capacity 15 (Saturday KS3 at 1400, Sundays GCSE at 1800)", async () => {
    const { rows } = await db.query(
      `select title, weekday, start_time::text as start, product, capacity, price_pence,
              year_group, starts_on::text, active
         from group_series order by weekday desc, start_time`,
    );
    const common = {
      capacity: 15,
      price_pence: 1800,
      year_group: "Years 10 & 11",
      starts_on: "2026-11-01",
      active: true,
    };
    expect(rows).toEqual([
      { title: "Saturday KS3 Science Group", weekday: 6, start: "08:15:00", product: "saturday", ...common, price_pence: 1400, year_group: "Years 7–9" },
      { title: "Sunday Group — Session 1", weekday: 0, start: "08:15:00", product: "sunday_bundle", ...common },
      { title: "Sunday Group — Session 2", weekday: 0, start: "09:15:00", product: "sunday_bundle", ...common },
    ]);
  });

  test("resetData keeps seed rows", async () => {
    await resetData();
    const { rows } = await db.query(
      `select (select count(*) from settings)::int as settings,
              (select count(*) from term_periods)::int as terms,
              (select count(*) from blocked_times where is_default)::int as blocks,
              (select count(*) from group_series)::int as series,
              (select count(*) from profiles)::int as profiles`,
    );
    expect(rows[0]).toEqual({ settings: 1, terms: 9, blocks: 7, series: 3, profiles: 0 });
  });
});

describe("test helpers", () => {
  test("asUser runs as authenticated with auth.uid() and aal claims", async () => {
    const { rows } = await asUser(parentId, "aal2").query(
      `select current_user::text as role, auth.uid()::text as uid, auth.jwt()->>'aal' as aal`,
    );
    expect(rows[0]).toEqual({ role: "authenticated", uid: parentId, aal: "aal2" });
  });

  test("asAnon runs as anon with no uid", async () => {
    const { rows } = await asAnon().query(
      `select current_user::text as role, auth.uid() as uid`,
    );
    expect(rows[0]).toEqual({ role: "anon", uid: null });
  });

  test("claims do not leak back into the pool", async () => {
    await asUser(parentId).query("select 1");
    const { rows } = await db.query(
      `select current_user::text as role, auth.uid() as uid`,
    );
    expect(rows[0]).toEqual({ role: "postgres", uid: null });
  });
});
