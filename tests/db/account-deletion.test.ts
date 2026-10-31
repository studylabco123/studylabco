/** deleteAccount against the local Supabase stack (service client + admin API). */
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { deleteAccount } from "@/lib/account-deletion";
import { closeDb, createChild, createUser, db, resetData } from "./setup";

const NOW = new Date("2026-11-10T12:00:00Z");

let parentId: string;
let childId: string;

async function insertBooking(opts: {
  starts: string;
  status: string;
  paymentStatus?: string;
  price?: number;
  travel?: number;
}): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into bookings (parent_id, child_id, kind, location, starts_at, ends_at, busy_until, status,
                           price_pence, travel_fee_pence, payment_status, home_address, home_postcode)
     values ($1, $2, 'one_to_one', 'home_visit', $3::timestamptz, $3::timestamptz + interval '1 hour',
             $3::timestamptz + interval '1 hour', $4::booking_status, $5, $6, $7::payment_status,
             '1 Test Street', 'BB1 1QR')
     returning id`,
    [parentId, childId, opts.starts, opts.status, opts.price ?? 3000, opts.travel ?? 500, opts.paymentStatus ?? "paid"],
  );
  return rows[0].id;
}

beforeEach(async () => {
  await resetData();
  parentId = (await createUser()).id;
  // GoTrue cannot load users inserted raw with NULL token columns (its admin delete needs to).
  await db.query(
    `update auth.users set confirmation_token = '', recovery_token = '', email_change = '',
       email_change_token_new = '', email_change_token_current = '', phone_change = '',
       phone_change_token = '', reauthentication_token = '' where id = $1`,
    [parentId],
  );
  childId = await createChild(parentId);
  await db.query(
    "insert into consents (profile_id, kind, policy_version, granted) values ($1, 'terms', '2026-11-01', true)",
    [parentId],
  );
});
afterAll(closeDb);

describe("deleteAccount", () => {
  test("delete anonymises bookings but keeps ledger amounts", async () => {
    const id = await insertBooking({ starts: "2026-11-05T10:00:00Z", status: "attended", paymentStatus: "paid" });
    await db.query(
      "insert into ledger (booking_id, parent_id, kind, method, amount_pence, occurred_on) values ($1, $2, 'payment', 'cash', 3500, '2026-11-05')",
      [id, parentId],
    );
    await db.query("insert into email_log (booking_id, template, to_email) values ($1, 'booking_confirmed', 'x@example.test')", [id]);
    await db.query("update ledger set note = 'paid by Pat Parent cash' where booking_id = $1", [id]);
    await db.query("insert into mileage (booking_id, trip_on, miles, note) values ($1, '2026-11-05', 3, 'visit to Pat Parent')", [id]);
    await db.query("insert into agreements (child_id, policy_version, emergency_contact_name, emergency_contact_phone, consent_contact, signed_name) values ($1, '2026-11-01', 'Gran', '01632960123', true, 'Pat')", [childId]);

    const res = await deleteAccount(parentId, { now: NOW });
    expect(res).toEqual({ ok: true });

    const b = (await db.query("select * from bookings where id = $1", [id])).rows[0];
    expect(b.parent_id).toBeNull();
    expect(b.child_id).toBeNull();
    expect(b.home_address).toBeNull();
    expect(b.home_postcode).toBeNull();
    expect(b.price_pence).toBe(3000);
    expect(b.travel_fee_pence).toBe(500);
    expect(b.status).toBe("attended");
    expect(new Date(b.starts_at).toISOString()).toBe("2026-11-05T10:00:00.000Z");

    const l = (await db.query("select amount_pence, parent_id from ledger where booking_id = $1", [id])).rows;
    expect(l).toEqual([{ amount_pence: 3500, parent_id: null }]);

    expect((await db.query("select 1 from email_log")).rowCount).toBe(0);
    expect((await db.query("select note from ledger where booking_id = $1", [id])).rows[0].note).toBe("");
    expect((await db.query("select note from mileage where booking_id = $1", [id])).rows[0].note).toBe("");

    for (const [table, col, val] of [
      ["children", "id", childId],
      ["agreements", "child_id", childId],
      ["consents", "profile_id", parentId],
      ["profiles", "id", parentId],
      ["auth.users", "id", parentId],
    ]) {
      expect((await db.query(`select 1 from ${table} where ${col} = $1`, [val])).rowCount).toBe(0);
    }
  });

  test("refuses while money owed", async () => {
    const id = await insertBooking({ starts: "2026-11-05T10:00:00Z", status: "attended", paymentStatus: "unpaid" });
    const res = await deleteAccount(parentId, { now: NOW });
    expect(res).toMatchObject({ ok: false, reason: "money_owed", owedPence: 3500 });
    if (!res.ok) expect(res.message).toMatch(/£35/);

    const b = (await db.query("select parent_id, home_address from bookings where id = $1", [id])).rows[0];
    expect(b.parent_id).toBe(parentId);
    expect(b.home_address).toBe("1 Test Street");
    expect((await db.query("select 1 from auth.users where id = $1", [parentId])).rowCount).toBe(1);
    expect((await db.query("select 1 from children where id = $1", [childId])).rowCount).toBe(1);
  });

  test("refuses with a lesson inside the notice window", async () => {
    const id = await insertBooking({ starts: "2026-11-11T10:00:00Z", status: "confirmed", paymentStatus: "paid" });
    const res = await deleteAccount(parentId, { now: NOW });
    expect(res).toMatchObject({ ok: false, reason: "lesson_soon" });
    if (!res.ok) expect(res.message).toBe("You have a lesson within the next 48 hours. Please contact Study Lab Co. or wait until it has passed.");
    expect((await db.query("select status::text from bookings where id = $1", [id])).rows[0].status).toBe("confirmed");
    expect((await db.query("select 1 from auth.users where id = $1", [parentId])).rowCount).toBe(1);
  });

  test("cancels future bookings beyond the window, crediting paid ones", async () => {
    const paid = await insertBooking({ starts: "2026-11-20T10:00:00Z", status: "confirmed", paymentStatus: "paid" });
    const unpaid = await insertBooking({ starts: "2026-11-22T10:00:00Z", status: "pending", paymentStatus: "unpaid" });
    expect(await deleteAccount(parentId, { now: NOW })).toEqual({ ok: true });
    const rows = (await db.query("select id, status::text, payment_status::text, cancelled_by, cancelled_at, parent_id from bookings")).rows;
    const p = rows.find((r) => r.id === paid);
    const u = rows.find((r) => r.id === unpaid);
    expect(p).toMatchObject({ status: "cancelled", payment_status: "credited", cancelled_by: "parent", parent_id: null });
    expect(p!.cancelled_at).not.toBeNull();
    expect(u).toMatchObject({ status: "cancelled", payment_status: "unpaid", cancelled_by: "parent" });
  });

  test("refuses for a non-parent profile", async () => {
    await db.query("update profiles set role = 'admin' where id = $1", [parentId]);
    const res = await deleteAccount(parentId, { now: NOW });
    expect(res).toMatchObject({ ok: false, reason: "not_a_parent" });
    expect((await db.query("select 1 from auth.users where id = $1", [parentId])).rowCount).toBe(1);
  });
});
