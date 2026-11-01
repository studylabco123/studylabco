import { afterAll, beforeEach, describe, expect, test } from "vitest";
import {
  asAnon,
  asService,
  asUser,
  closeDb,
  createChild,
  createUser,
  db,
  pool,
  resetData,
} from "./setup";

let parentId: string;

async function rejection(p: Promise<unknown>): Promise<{ code?: string; message?: string } | undefined> {
  try {
    await p;
    return undefined;
  } catch (err) {
    return err as { code?: string; message?: string };
  }
}

async function insertSession(capacity: number, status = "scheduled"): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into group_sessions (title, starts_at, ends_at, capacity, price_pence, status)
     values ('Saturday GCSE Science Group', '2026-11-07T08:15Z', '2026-11-07T09:15Z', $1, 1800, $2)
     returning id`,
    [capacity, status],
  );
  return rows[0].id;
}

const reserveSql = "select public.reserve_group_seat($1, $2, $3, 1800) as id";

function reserve(session: string, child: string) {
  return asService().query<{ id: string }>(reserveSql, [session, parentId, child]);
}

beforeEach(async () => {
  await resetData();
  parentId = (await createUser()).id;
});

afterAll(closeDb);

describe("reserve_group_seat", () => {
  test("inserts a confirmed group booking copied from the session", async () => {
    const session = await insertSession(15);
    const child = await createChild(parentId);
    const bundle = "6f1c2a1e-0000-4000-8000-000000000001";
    const { rows } = await asService().query<{ id: string }>(
      "select public.reserve_group_seat($1, $2, $3, 1500, $4) as id",
      [session, parentId, child, bundle],
    );
    const { rows: b } = await db.query(
      `select kind::text, location::text, status::text, price_pence, group_session_id, bundle_id,
              parent_id, child_id, starts_at, ends_at, busy_until
         from bookings where id = $1`,
      [rows[0].id],
    );
    expect(b[0]).toMatchObject({
      kind: "group",
      location: "group_venue",
      status: "confirmed",
      price_pence: 1500,
      group_session_id: session,
      bundle_id: bundle,
      parent_id: parentId,
      child_id: child,
    });
    expect(b[0].starts_at.toISOString()).toBe("2026-11-07T08:15:00.000Z");
    expect(b[0].ends_at.toISOString()).toBe("2026-11-07T09:15:00.000Z");
    expect(b[0].busy_until.toISOString()).toBe("2026-11-07T09:15:00.000Z");
  });

  test("15 seats then session_full", async () => {
    const session = await insertSession(15);
    for (let i = 0; i < 15; i++) {
      const child = await createChild(parentId, { firstName: `Kid${i}` });
      await expect(reserve(session, child)).resolves.toBeDefined();
    }
    const sixteenth = await createChild(parentId, { firstName: "Kid15" });
    const err = await rejection(reserve(session, sixteenth));
    expect(err?.message).toBe("session_full");
    expect(err?.code).toBe("P0001");
    const { rows } = await db.query(
      "select count(*)::int as n from bookings where group_session_id = $1",
      [session],
    );
    expect(rows[0].n).toBe(15);
  });

  test("pending and attended seats count; cancelled seats do not", async () => {
    const session = await insertSession(3);
    const kids = await Promise.all([0, 1, 2, 3].map((i) => createChild(parentId, { firstName: `K${i}` })));
    const ids = [];
    for (const k of kids.slice(0, 3)) ids.push((await reserve(session, k)).rows[0].id);
    await db.query("update bookings set status = 'pending' where id = $1", [ids[0]]);
    await db.query("update bookings set status = 'attended' where id = $1", [ids[1]]);
    expect((await rejection(reserve(session, kids[3])))?.message).toBe("session_full");
    await db.query("update bookings set status = 'cancelled' where id = $1", [ids[2]]);
    await expect(reserve(session, kids[3])).resolves.toBeDefined();
  });

  test("session_cancelled", async () => {
    const session = await insertSession(15, "cancelled");
    const child = await createChild(parentId);
    const err = await rejection(reserve(session, child));
    expect(err?.message).toBe("session_cancelled");
    expect(err?.code).toBe("P0001");
  });

  test("last seat race", async () => {
    const session = await insertSession(2);
    const [first, a, b] = await Promise.all(
      ["First", "Racer A", "Racer B"].map((n) => createChild(parentId, { firstName: n })),
    );
    await reserve(session, first);
    // Two separate pool connections, called concurrently.
    const [c1, c2] = await Promise.all([pool.connect(), pool.connect()]);
    try {
      await Promise.all([c1.query("set role service_role"), c2.query("set role service_role")]);
      const results = await Promise.allSettled([
        c1.query(reserveSql, [session, parentId, a]),
        c2.query(reserveSql, [session, parentId, b]),
      ]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0].reason as Error).message).toBe("session_full");
    } finally {
      await Promise.all([c1.query("reset role"), c2.query("reset role")]);
      c1.release();
      c2.release();
    }
    const { rows } = await db.query(
      "select count(*)::int as n from bookings where group_session_id = $1",
      [session],
    );
    expect(rows[0].n).toBe(2);
  });

  test("second caller waits on the session lock and then sees session_full", async () => {
    const session = await insertSession(1);
    const [a, b] = await Promise.all(["A", "B"].map((n) => createChild(parentId, { firstName: n })));
    const [c1, c2] = await Promise.all([pool.connect(), pool.connect()]);
    try {
      await c1.query("begin");
      await c1.query("set local role service_role");
      await c1.query(reserveSql, [session, parentId, a]);
      // c1 still holds the row lock: c2 must block rather than read a stale count.
      let settled = false;
      const second = c2
        .query(reserveSql, [session, parentId, b])
        .finally(() => {
          settled = true;
        });
      second.catch(() => undefined);
      await new Promise((r) => setTimeout(r, 300));
      expect(settled).toBe(false);
      await c1.query("commit");
      const err = await rejection(second);
      expect(err?.message).toBe("session_full");
    } finally {
      await c1.query("rollback").catch(() => undefined);
      c1.release();
      c2.release();
    }
  });

  test("only the service role can call reserve_group_seat and ensure_group_sessions", async () => {
    const session = await insertSession(15);
    const child = await createChild(parentId);
    const admin = (await createUser({ role: "admin" })).id;
    for (const caller of [asAnon(), asUser(parentId), asUser(admin, "aal2")]) {
      expect((await rejection(caller.query(reserveSql, [session, parentId, child])))?.code).toBe("42501");
      expect(
        (await rejection(caller.query("select public.ensure_group_sessions('2026-11-29')")))?.code,
      ).toBe("42501");
    }
  });
});

describe("seats_left", () => {
  test("anon can call seats_left", async () => {
    const session = await insertSession(15);
    const child = await createChild(parentId);
    await reserve(session, child);
    const { rows } = await asAnon().query("select public.seats_left($1) as n", [session]);
    expect(rows[0].n).toBe(14);
    const auth = await asUser(parentId).query("select public.seats_left($1) as n", [session]);
    expect(auth.rows[0].n).toBe(14);
  });
});

describe("ensure_group_sessions", () => {
  const ensure = (until: string) =>
    asService().query<{ n: number }>("select public.ensure_group_sessions($1) as n", [until]);

  test("ensure_group_sessions creates Sat and Sun occurrences through 2026-11-29", async () => {
    const { rows } = await ensure("2026-11-29");
    expect(rows[0].n).toBe(14);
    const { rows: s } = await db.query<{ title: string; n: number }>(
      `select title, count(*)::int as n from group_sessions
        where starts_at >= '2026-11-01' and starts_at < '2026-11-30'
        group by title order by title`,
    );
    expect(s).toEqual([
      { title: "Saturday KS3 Science Group", n: 4 },
      { title: "Sunday Group — Session 1", n: 5 },
      { title: "Sunday Group — Session 2", n: 5 },
    ]);
    const { rows: one } = await db.query(
      `select capacity, price_pence, status, is_online, ends_at - starts_at = interval '60 minutes' as hour
         from group_sessions where title like 'Sunday%' limit 1`,
    );
    expect(one[0]).toEqual({ capacity: 15, price_pence: 1800, status: "scheduled", is_online: false, hour: true });
  });

  test("ensure_group_sessions is idempotent", async () => {
    expect((await ensure("2026-11-29")).rows[0].n).toBe(14);
    expect((await ensure("2026-11-29")).rows[0].n).toBe(0);
    expect((await ensure("2026-12-06")).rows[0].n).toBe(3);
  });

  test("Sunday 2026-11-01 08:15 London is stored as 08:15Z", async () => {
    await ensure("2026-11-01");
    const { rows } = await db.query<{ starts_at: Date; ends_at: Date }>(
      `select starts_at, ends_at from group_sessions where title = 'Sunday Group — Session 1'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].starts_at.toISOString()).toBe("2026-11-01T08:15:00.000Z");
    expect(rows[0].ends_at.toISOString()).toBe("2026-11-01T09:15:00.000Z");
  });

  test("Saturday 2027-04-03 08:15 London is stored as 07:15Z", async () => {
    await ensure("2027-04-03");
    const { rows } = await db.query<{ starts_at: Date }>(
      `select starts_at from group_sessions
        where title = 'Saturday KS3 Science Group' and starts_at >= '2027-04-03' and starts_at < '2027-04-04'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].starts_at.toISOString()).toBe("2027-04-03T07:15:00.000Z");
  });

  test("skips dates covered by a whole-day block, not partial blocks", async () => {
    // Boxing Day 2026 (Saturday) is a seeded whole-day block.
    await db.query(
      `insert into blocked_times (starts_at, ends_at, reason) values
         ('2026-11-08T00:00Z', '2026-11-09T00:00Z', 'whole day'),
         ('2026-11-14T08:00Z', '2026-11-14T10:00Z', 'partial')`,
    );
    await ensure("2026-12-31");
    const { rows } = await db.query<{ d: string }>(
      `select (starts_at at time zone 'Europe/London')::date::text as d from group_sessions`,
    );
    const days = rows.map((r) => r.d);
    expect(days).not.toContain("2026-12-26");
    expect(days).not.toContain("2026-11-08");
    expect(days).toContain("2026-11-14");
    expect(days).toContain("2026-12-27");
  });

  test("inactive series are skipped", async () => {
    await db.query("update group_series set active = false where weekday = 0");
    try {
      expect((await ensure("2026-11-29")).rows[0].n).toBe(4);
    } finally {
      await db.query("update group_series set active = true");
    }
  });
});
