import { afterAll, beforeEach, describe, expect, test } from "vitest";
import {
  asAnon,
  asService,
  asUser,
  assertLocalDbUrl,
  closeDb,
  createChild,
  createUser,
  db,
  resetData,
} from "./setup";

let parentA: string;
let parentB: string;
let childA: string;
let childB: string;
let adminId: string;

async function errorCode(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (err) {
    return (err as { code?: string }).code;
  }
}

async function insertSession(startsAt: string, status = "scheduled"): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into group_sessions (title, starts_at, ends_at, capacity, price_pence, status)
     values ('Test Group', $1::timestamptz, $1::timestamptz + interval '1 hour', 15, 1800, $2)
     returning id`,
    [startsAt, status],
  );
  return rows[0].id;
}

async function insertBooking(parentId: string, childId: string, startsAt: string) {
  const { rows } = await db.query<{ id: string }>(
    `insert into bookings (parent_id, child_id, kind, location, starts_at, ends_at, busy_until, price_pence)
     values ($1, $2, 'one_to_one', 'tutor_place', $3::timestamptz,
             $3::timestamptz + interval '1 hour', $3::timestamptz + interval '1 hour', 2500)
     returning id`,
    [parentId, childId, startsAt],
  );
  return rows[0].id;
}

beforeEach(async () => {
  await resetData();
  parentA = (await createUser({ fullName: "Parent A" })).id;
  parentB = (await createUser({ fullName: "Parent B" })).id;
  adminId = (await createUser({ fullName: "Tutor", role: "admin" })).id;
  childA = await createChild(parentA, { firstName: "Alice" });
  childB = await createChild(parentB, { firstName: "Bob" });
});

afterAll(closeDb);

describe("RLS coverage", () => {
  test("RLS is enabled on every table in public", async () => {
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p')
        order by c.relname`,
    );
    expect(rows.length).toBe(22);
    expect(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
  });

  test("anon and authenticated cannot truncate any public table", async () => {
    const { rows } = await db.query<{ relname: string }>(
      `select c.relname
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and (has_table_privilege('anon', c.oid, 'TRUNCATE')
               or has_table_privilege('authenticated', c.oid, 'TRUNCATE'))`,
    );
    expect(rows).toEqual([]);
  });
});

describe("parents", () => {
  test("parent A cannot read parent B children", async () => {
    const { rows } = await asUser(parentA).query("select id from children where parent_id = $1", [
      parentB,
    ]);
    expect(rows).toHaveLength(0);
    const own = await asUser(parentA).query("select id from children");
    expect(own.rows.map((r) => r.id)).toEqual([childA]);
  });

  test("parent can read, add and edit own children only, and delete none (R25)", async () => {
    const me = asUser(parentA);
    const ins = await me.query<{ id: string }>(
      `insert into children (parent_id, first_name, last_name, school_year, exam_board, tier, subjects)
       values ($1, 'Cara', 'A', 11, 'OCR', 'Foundation', '{Physics}') returning id`,
      [parentA],
    );
    const upd = await me.query("update children set target_grade = '7' where id = $1", [
      ins.rows[0].id,
    ]);
    expect(upd.rowCount).toBe(1);
    // No delete policy: a delete would cascade to the agreement, approval and tutor notes.
    const del = await me.query("delete from children where id = $1", [ins.rows[0].id]);
    expect(del.rowCount).toBe(0);
    expect((await db.query("select 1 from children where id = $1", [ins.rows[0].id])).rowCount).toBe(1);
    // Nor can a child be moved to another parent.
    expect(
      await errorCode(me.query("update children set parent_id = $1 where id = $2", [parentB, ins.rows[0].id])),
    ).toBe("42501");

    // Another parent's child: invisible to update/delete, and cannot be created for them.
    expect((await me.query("update children set target_grade = '9' where id = $1", [childB])).rowCount).toBe(0);
    expect((await me.query("delete from children where id = $1", [childB])).rowCount).toBe(0);
    expect(
      await errorCode(
        me.query(
          `insert into children (parent_id, first_name, last_name, school_year, exam_board, tier, subjects)
           values ($1, 'X', 'Y', 10, 'AQA', 'Higher', '{Biology}')`,
          [parentB],
        ),
      ),
    ).toBe("42501");
  });

  test("parent reads and updates own profile but not others", async () => {
    const me = asUser(parentA);
    const { rows } = await me.query("select id from profiles");
    expect(rows.map((r) => r.id)).toEqual([parentA]);
    const upd = await me.query(
      "update profiles set full_name = 'Renamed', phone = '07700900000', marketing_opt_in = true where id = $1",
      [parentA],
    );
    expect(upd.rowCount).toBe(1);
    const other = await me.query("update profiles set full_name = 'Hacked' where id = $1", [parentB]);
    expect(other.rowCount).toBe(0);
  });

  test("parent cannot make self admin", async () => {
    const me = asUser(parentA, "aal2");
    expect(await errorCode(me.query("update profiles set role = 'admin' where id = $1", [parentA]))).toBe(
      "42501",
    );
    expect(
      await errorCode(me.query("update profiles set is_blocked = true where id = $1", [parentA])),
    ).toBe("42501");
    expect(
      await errorCode(me.query("update profiles set blocked_reason = 'x' where id = $1", [parentA])),
    ).toBe("42501");
    const { rows } = await db.query("select role from profiles where id = $1", [parentA]);
    expect(rows[0].role).toBe("parent");
  });

  test("blocked parent cannot unblock self", async () => {
    await db.query("update profiles set is_blocked = true, blocked_reason = 'no-shows' where id = $1", [
      parentA,
    ]);
    expect(
      await errorCode(
        asUser(parentA).query("update profiles set is_blocked = false, blocked_reason = null where id = $1", [
          parentA,
        ]),
      ),
    ).toBe("42501");
  });

  test("parent cannot read settings_private", async () => {
    const { rows } = await asUser(parentA).query("select * from settings_private");
    expect(rows).toHaveLength(0);
  });

  test("parent cannot read tutor_notes", async () => {
    await db.query("insert into tutor_notes (child_id, body) values ($1, 'secret')", [childA]);
    const { rows } = await asUser(parentA).query("select * from tutor_notes");
    expect(rows).toHaveLength(0);
  });

  test("parent cannot read admin-only tables", async () => {
    await db.query(
      "insert into expenses (spent_on, category, amount_pence) values ('2026-11-01', 'books', 999)",
    );
    await db.query("insert into mileage (trip_on, miles) values ('2026-11-01', 3.5)");
    await db.query(
      "insert into email_log (template, to_email) values ('welcome', 'a@example.test')",
    );
    const me = asUser(parentA);
    await db.query(
      "insert into blocked_times (starts_at, ends_at, reason) values ('2026-11-02T00:00Z', '2026-11-03T00:00Z', 'private')",
    );
    await db.query(
      "insert into blocked_rules (weekday, start_time, end_time, valid_from, reason) values (2, '09:00', '10:00', '2026-11-01', 'private')",
    );
    for (const t of [
      "expenses",
      "mileage",
      "email_log",
      "settings_private",
      "tutor_notes",
      "blocked_times",
      "blocked_rules",
    ]) {
      const { rows } = await me.query(`select * from ${t}`);
      expect(rows, t).toHaveLength(0);
    }
  });

  test("parent cannot insert bookings", async () => {
    const code = await errorCode(
      asUser(parentA).query(
        `insert into bookings (parent_id, child_id, kind, location, starts_at, ends_at, busy_until, price_pence)
         values ($1, $2, 'one_to_one', 'tutor_place', '2026-11-02T17:00Z', '2026-11-02T18:00Z',
                 '2026-11-02T18:00Z', 0)`,
        [parentA, childA],
      ),
    );
    expect(code).toBe("42501");
  });

  test("parent cannot update or delete own bookings", async () => {
    const id = await insertBooking(parentA, childA, "2026-11-02T17:00Z");
    const me = asUser(parentA);
    const upd = await errorCode(me.query("update bookings set price_pence = 0 where id = $1", [id]));
    const del = await errorCode(me.query("delete from bookings where id = $1", [id]));
    // Either a privilege error or zero rows touched; the row must be unchanged.
    expect([undefined, "42501"]).toContain(upd);
    expect([undefined, "42501"]).toContain(del);
    const { rows } = await db.query("select price_pence from bookings where id = $1", [id]);
    expect(rows[0].price_pence).toBe(2500);
  });

  test("parent sees only own bookings, block bookings, ledger and student status", async () => {
    const bA = await insertBooking(parentA, childA, "2026-11-02T17:00Z");
    await insertBooking(parentB, childB, "2026-11-02T18:00Z");
    await db.query(
      `insert into block_bookings (parent_id, child_id, product, weeks, price_pence)
       values ($1, $2, 'saturday', 6, 10200), ($3, $4, 'saturday', 6, 10200)`,
      [parentA, childA, parentB, childB],
    );
    await db.query(
      `insert into ledger (booking_id, parent_id, kind, method, amount_pence, occurred_on)
       values ($1, $2, 'payment', 'cash', 2500, '2026-11-02'),
              (null, $3, 'payment', 'cash', 2500, '2026-11-02')`,
      [bA, parentA, parentB],
    );
    await db.query(
      "insert into student_status (child_id, approved_at) values ($1, now()), ($2, now())",
      [childA, childB],
    );
    const me = asUser(parentA);
    expect((await me.query("select parent_id from bookings")).rows).toEqual([{ parent_id: parentA }]);
    expect((await me.query("select parent_id from block_bookings")).rows).toEqual([{ parent_id: parentA }]);
    expect((await me.query("select parent_id from ledger")).rows).toEqual([{ parent_id: parentA }]);
    expect((await me.query("select child_id from student_status")).rows).toEqual([{ child_id: childA }]);
    // Parents cannot approve themselves.
    expect(
      await errorCode(me.query("insert into student_status (child_id, approved_at) values ($1, now())", [childA])),
    ).toBe("42501");
  });

  test("parent inserts and reads own agreements and consents only", async () => {
    const me = asUser(parentA);
    await me.query(
      `insert into agreements (child_id, policy_version, emergency_contact_name,
         emergency_contact_phone, consent_contact, signed_name)
       values ($1, 'v1', 'Gran', '07700900001', true, 'Parent A')`,
      [childA],
    );
    await me.query(
      "insert into consents (profile_id, kind, policy_version, granted) values ($1, 'terms', 'v1', true)",
      [parentA],
    );
    expect((await me.query("select child_id from agreements")).rows).toEqual([{ child_id: childA }]);
    expect((await me.query("select profile_id from consents")).rows).toEqual([{ profile_id: parentA }]);

    expect(
      await errorCode(
        me.query(
          `insert into agreements (child_id, policy_version, emergency_contact_name,
             emergency_contact_phone, consent_contact, signed_name)
           values ($1, 'v1', 'X', '0', true, 'X')`,
          [childB],
        ),
      ),
    ).toBe("42501");
    expect(
      await errorCode(
        me.query(
          "insert into consents (profile_id, kind, policy_version, granted) values ($1, 'terms', 'v1', true)",
          [parentB],
        ),
      ),
    ).toBe("42501");
    expect((await asUser(parentB).query("select * from agreements")).rows).toHaveLength(0);
  });

  test("parent cannot write public reference tables", async () => {
    const me = asUser(parentA);
    expect((await me.query("update settings set price_group_pence = 1")).rowCount).toBe(0);
    expect(
      await errorCode(
        me.query(
          "insert into blocked_times (starts_at, ends_at) values ('2026-11-02T00:00Z', '2026-11-03T00:00Z')",
        ),
      ),
    ).toBe("42501");
    expect((await me.query("delete from group_series")).rowCount).toBe(0);
    const { rows } = await db.query("select price_group_pence from settings");
    expect(rows[0].price_group_pence).toBe(1800);
  });
});

describe("group sessions for parents", () => {
  test("parent sees past or cancelled sessions they booked, not others", async () => {
    const booked = await insertSession("2020-01-04T08:15Z", "cancelled");
    await insertSession("2020-01-11T08:15Z");
    await db.query(
      `insert into bookings (parent_id, child_id, kind, location, starts_at, ends_at, busy_until,
                             group_session_id, price_pence)
       values ($1, $2, 'group', 'group_venue', '2020-01-04T08:15Z', '2020-01-04T09:15Z',
               '2020-01-04T09:15Z', $3, 1800)`,
      [parentA, childA, booked],
    );
    const q = "select id from group_sessions";
    expect((await asUser(parentA).query(q)).rows).toEqual([{ id: booked }]);
    expect((await asUser(parentB).query(q)).rows).toEqual([]);
  });
});

describe("admin", () => {
  test("admin without aal2 cannot read settings_private", async () => {
    const { rows } = await asUser(adminId, "aal1").query("select * from settings_private");
    expect(rows).toHaveLength(0);
    const kids = await asUser(adminId, "aal1").query("select * from children");
    expect(kids.rows).toHaveLength(0);
  });

  test("admin with aal2 reads everything", async () => {
    await db.query("insert into tutor_notes (child_id, body) values ($1, 'note')", [childA]);
    await insertBooking(parentB, childB, "2026-11-02T17:00Z");
    await insertSession("2020-01-04T08:15Z", "cancelled");
    const admin = asUser(adminId, "aal2");
    expect((await admin.query("select * from settings_private")).rows).toHaveLength(1);
    expect((await admin.query("select * from tutor_notes")).rows).toHaveLength(1);
    expect((await admin.query("select * from children")).rows).toHaveLength(2);
    expect((await admin.query("select * from profiles")).rows).toHaveLength(3);
    expect((await admin.query("select * from bookings")).rows).toHaveLength(1);
    expect((await admin.query("select * from group_sessions")).rows).toHaveLength(1);
    expect((await admin.query("select * from blocked_times")).rows).toHaveLength(7);
  });

  test("admin with aal2 can write admin tables and change roles", async () => {
    const admin = asUser(adminId, "aal2");
    await admin.query("update settings_private set meeting_link = 'https://meet.example.test'");
    await admin.query(
      "insert into expenses (spent_on, category, amount_pence) values ('2026-11-01', 'books', 999)",
    );
    await admin.query(
      "insert into blocked_times (starts_at, ends_at, reason) values ('2026-11-02T00:00Z', '2026-11-03T00:00Z', 'x')",
    );
    await admin.query("update profiles set is_blocked = true, blocked_reason = 'r' where id = $1", [parentA]);
    const { rows } = await db.query(
      `select (select meeting_link from settings_private) as link,
              (select count(*) from expenses)::int as expenses,
              (select is_blocked from profiles where id = $1) as blocked`,
      [parentA],
    );
    expect(rows[0]).toEqual({ link: "https://meet.example.test", expenses: 1, blocked: true });
  });

  test("is_admin is true only for admin at aal2", async () => {
    const q = "select public.is_admin() as v";
    expect((await asUser(adminId, "aal2").query(q)).rows[0].v).toBe(true);
    expect((await asUser(adminId, "aal1").query(q)).rows[0].v).toBe(false);
    expect((await asUser(parentA, "aal2").query(q)).rows[0].v).toBe(false);
    expect((await asAnon().query(q)).rows[0].v).toBe(false);
  });
});

describe("anon", () => {
  test("anon can read settings and future scheduled group sessions", async () => {
    const future = await insertSession("2099-01-03T08:15Z");
    await insertSession("2099-01-10T08:15Z", "cancelled");
    await insertSession("2020-01-04T08:15Z");
    const anon = asAnon();
    expect((await anon.query("select price_group_pence from settings")).rows).toEqual([
      { price_group_pence: 1800 },
    ]);
    expect((await anon.query("select id from group_sessions")).rows).toEqual([{ id: future }]);
    expect((await anon.query("select * from group_series")).rows).toHaveLength(3);
    expect((await anon.query("select * from term_periods")).rows).toHaveLength(9);
    expect((await anon.query("select * from availability_rules")).rows).toHaveLength(12);
  });

  test("anon cannot read private tables or write anything", async () => {
    await insertBooking(parentA, childA, "2026-11-02T17:00Z");
    const anon = asAnon();
    const tables = [
      "profiles",
      "children",
      "bookings",
      "settings_private",
      "ledger",
      "consents",
      "blocked_times",
      "blocked_rules",
    ];
    for (const t of tables) {
      const code = await errorCode(anon.query(`select * from ${t}`));
      if (code === undefined) {
        expect((await anon.query(`select * from ${t}`)).rows, t).toHaveLength(0);
      } else {
        expect(code, t).toBe("42501");
      }
    }
    expect(await errorCode(anon.query("update settings set price_group_pence = 1"))).toBe("42501");
    expect(
      await errorCode(
        anon.query(
          "insert into consents (profile_id, kind, policy_version, granted) values ($1, 'terms', 'v1', true)",
          [parentA],
        ),
      ),
    ).toBe("42501");
  });
});

describe("profiles trigger", () => {
  test("on_auth_user_created creates a profile from metadata", async () => {
    const { rows: u } = await db.query<{ id: string }>(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
               'authenticated', 'new@example.test', '', '{}',
               '{"full_name": "New Parent", "phone": "07700900123", "role": "admin"}', now(), now())
       returning id`,
    );
    const { rows } = await db.query(
      "select full_name, email, phone, role::text, is_blocked from profiles where id = $1",
      [u[0].id],
    );
    expect(rows).toEqual([
      {
        full_name: "New Parent",
        email: "new@example.test",
        phone: "07700900123",
        role: "parent",
        is_blocked: false,
      },
    ]);
  });
});

describe("service role", () => {
  test("service role can insert bookings (server actions)", async () => {
    const { rowCount } = await asService().query(
      `insert into bookings (parent_id, child_id, kind, location, starts_at, ends_at, busy_until, price_pence)
       values ($1, $2, 'one_to_one', 'tutor_place', '2026-11-02T17:00Z', '2026-11-02T18:00Z',
               '2026-11-02T18:00Z', 2500)`,
      [parentA, childA],
    );
    expect(rowCount).toBe(1);
  });
});

describe("test DB guard", () => {
  test("assertLocalDbUrl accepts only localhost", () => {
    expect(() => assertLocalDbUrl("postgresql://u:p@127.0.0.1:54322/postgres")).not.toThrow();
    expect(() => assertLocalDbUrl("postgresql://u:p@localhost:5432/postgres")).not.toThrow();
    expect(() => assertLocalDbUrl("postgresql://u:p@db.abc.supabase.co:5432/postgres")).toThrow(
      /non-local/,
    );
    expect(() => assertLocalDbUrl("not a url")).toThrow();
  });
});
