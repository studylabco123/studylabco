/**
 * Shared helpers for database tests (tests/db/**). They talk straight to the
 * local Supabase Postgres on SUPABASE_DB_URL (loaded from .env.test by the
 * "db" project in vitest.config.ts). DB test files run serially because they
 * share one database.
 *
 * - `db` / `pool`: connects as `postgres` (bypasses RLS) for arrange/assert.
 * - `asUser(id, aal)` / `asAnon()`: run SQL the way PostgREST would for that
 *   caller, so `auth.uid()`, `auth.jwt()` and RLS policies apply.
 * - `resetData()`: wipes business data between tests (see its doc comment).
 * - `createUser()`: inserts an auth user plus its profile row.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  throw new Error("SUPABASE_DB_URL is not set (expected from .env.test)");
}

export const pool = new pg.Pool({ connectionString, max: 4 });

/** Privileged queries (as the `postgres` role, RLS bypassed). */
export const db = {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<pg.QueryResult<R>> {
    return pool.query<R>(text, values);
  },
};

export type Aal = "aal1" | "aal2";

export interface Scoped {
  /** Runs one statement in its own transaction as this caller, then commits. */
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<pg.QueryResult<R>>;
  /** Runs `fn` inside one transaction as this caller; commits unless it throws. */
  tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T>;
}

function scoped(role: "authenticated" | "anon", claims: Record<string, unknown>): Scoped {
  const tx = async <T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      // Same as PostgREST: role switch and JWT claims, both transaction-local.
      await client.query(`set local role ${role}`);
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify(claims),
      ]);
      const result = await fn(client);
      await client.query("commit");
      return result;
    } catch (err) {
      await client.query("rollback").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  };
  return {
    tx,
    query: (text, values) => tx((c) => c.query(text, values)),
  };
}

/** Acts as a signed-in user: role `authenticated`, JWT `sub = id`, `aal`. */
export function asUser(id: string, aal: Aal = "aal1"): Scoped {
  return scoped("authenticated", { sub: id, role: "authenticated", aal });
}

/** Acts as a signed-out visitor: role `anon`. */
export function asAnon(): Scoped {
  return scoped("anon", { role: "anon" });
}

export interface TestUser {
  id: string;
  email: string;
}

/**
 * Creates an auth user and its `profiles` row (upserted, so it also works
 * once Task 4's `on_auth_user_created` trigger creates the profile itself).
 */
export async function createUser(
  opts: { email?: string; fullName?: string; phone?: string; role?: "parent" | "admin" } = {},
): Promise<TestUser> {
  const id = randomUUID();
  const email = opts.email ?? `user-${id.slice(0, 8)}@example.test`;
  const fullName = opts.fullName ?? "Test Parent";
  await pool.query(
    `insert into auth.users
       (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
             $2, '', now(), '{"provider":"email","providers":["email"]}', $3, now(), now())`,
    [id, email, JSON.stringify({ full_name: fullName, phone: opts.phone ?? null })],
  );
  await pool.query(
    `insert into public.profiles (id, full_name, email, phone, role)
     values ($1, $2, $3, $4, $5)
     on conflict (id) do update
       set full_name = excluded.full_name, email = excluded.email,
           phone = excluded.phone, role = excluded.role`,
    [id, fullName, email, opts.phone ?? null, opts.role ?? "parent"],
  );
  return { id, email };
}

/** Inserts a Year 10 child for `parentId` and returns its id. */
export async function createChild(
  parentId: string,
  opts: { firstName?: string; schoolYear?: 10 | 11 } = {},
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into public.children
       (parent_id, first_name, last_name, school_year, exam_board, tier, subjects)
     values ($1, $2, 'Test', $3, 'AQA', 'Higher', '{Combined Science}')
     returning id`,
    [parentId, opts.firstName ?? "Sam", opts.schoolYear ?? 10],
  );
  return rows[0].id;
}

/**
 * Deletes all business data so each test starts from the seeded state.
 *
 * Emptied: bookings, block_bookings, group_sessions, ledger, expenses, mileage,
 * email_log, tutor_notes, student_status, agreements, consents, children,
 * profiles, blocked_rules, non-default blocked_times, and every auth.users row
 * (the local test DB holds no real accounts).
 *
 * Kept (seed/reference data from 0004_seed.sql): settings, settings_private,
 * availability_rules, term_periods, blocked_times where is_default, and
 * group_series. Tests that change these must restore them themselves.
 * The payment_ref_seq sequence is not reset.
 */
export async function resetData(): Promise<void> {
  await pool.query(`
    truncate table
      public.email_log, public.ledger, public.mileage, public.expenses,
      public.bookings, public.block_bookings, public.group_sessions,
      public.tutor_notes, public.student_status, public.agreements,
      public.consents, public.children, public.profiles, public.blocked_rules
    cascade;
    delete from public.blocked_times where not is_default;
    delete from auth.users;
  `);
}

/** Ends the pool; call from `afterAll` in each DB test file. */
export async function closeDb(): Promise<void> {
  await pool.end();
}
