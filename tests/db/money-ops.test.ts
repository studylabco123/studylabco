import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { addExpense, prepareReceiptUpload, recordRefund, setMiles } from "@/lib/admin/money-ops";
import { createServiceClient } from "@/lib/supabase/service";
import { londonDateOf } from "@/lib/time";
import { asAnon, asUser, closeDb, createChild, createUser, db, resetData } from "./setup";

let parentId: string;
let childId: string;

beforeEach(async () => {
  await resetData();
  parentId = (await createUser()).id;
  childId = await createChild(parentId);
});
afterAll(closeDb);

async function paidBooking(payment = 2500): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into bookings (parent_id, child_id, kind, location, starts_at, ends_at, busy_until, status, price_pence, travel_fee_pence, payment_status)
     values ($1, $2, 'one_to_one', 'tutor_place', now() - interval '1 day', now() - interval '23 hours', now() - interval '23 hours', 'attended', 2500, 0, 'paid')
     returning id`,
    [parentId, childId],
  );
  await db.query(`insert into ledger (booking_id, parent_id, kind, method, amount_pence, occurred_on) values ($1,$2,'payment','cash',$3,current_date)`, [rows[0].id, parentId, payment]);
  return rows[0].id;
}

describe("receipt upload and addExpense", () => {
  const form = { date: "2026-01-05", category: "stationery", description: "Pens", amount: "21.50" };
  const now = { now: new Date("2026-02-01T12:00:00Z") };
  const bucket = () => createServiceClient().storage.from("receipts");

  async function upload(type: string, bytes: Uint8Array, spentOn = "2026-01-05") {
    const t = await prepareReceiptUpload(type, bytes.length, spentOn);
    if (!t.ok) throw new Error(t.message);
    // The browser's step: upload to the signed URL.
    const up = await bucket().uploadToSignedUrl(t.path, t.token, new Blob([bytes as BlobPart], { type }), { contentType: type });
    return { ticket: t, error: up.error };
  }

  test("a ticket is only issued for allowed types and sizes, at receipts/YYYY/uuid.ext", async () => {
    const t = await prepareReceiptUpload("image/jpeg", 1000, "2026-01-05");
    expect(t.ok && t.path).toMatch(/^receipts\/2026\/[0-9a-f-]{36}\.jpg$/);
    for (const [type, size] of [["image/svg+xml", 10], ["text/html", 10], ["image/png", 10 * 1024 * 1024 + 1], ["image/png", 0]] as const)
      expect((await prepareReceiptUpload(type, size, "2026-01-05")).ok).toBe(false);
    expect((await prepareReceiptUpload("image/png", 10, "nope")).ok).toBe(false);
  });
  test("upload then save: pence, private path, object in the receipts bucket", async () => {
    const { ticket, error } = await upload("image/png", new Uint8Array([1, 2, 3]));
    expect(error).toBeNull();
    expect(await addExpense({ ...form, receiptPath: ticket.path }, now)).toEqual({ ok: true });
    const { rows } = await db.query("select amount_pence, receipt_path from expenses");
    expect(rows[0]).toMatchObject({ amount_pence: 2150, receipt_path: ticket.path });
    expect((await db.query("select bucket_id from storage.objects where name = $1", [ticket.path])).rows[0].bucket_id).toBe("receipts");
    // The same object cannot back a second expense.
    expect((await addExpense({ ...form, receiptPath: ticket.path }, now)).ok).toBe(false);
  });
  test("the bucket itself refuses other types (svg)", async () => {
    const { error } = await upload("image/svg+xml", new Uint8Array([1])).catch((e: Error) => ({ error: e }));
    expect(error).toBeTruthy();
  });
  test("a receipt path that is not a fresh upload is refused, with no row saved", async () => {
    for (const receiptPath of ["../etc/passwd", "receipts/2026/not-a-uuid.jpg", "receipts/2026/0b9d6f2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.jpg"])
      expect((await addExpense({ ...form, receiptPath }, now)).ok).toBe(false);
    expect((await addExpense({ ...form, amount: "x" }, now)).ok).toBe(false);
    expect((await db.query("select 1 from expenses")).rowCount).toBe(0);
  });
  test("works without a receipt", async () => {
    expect((await addExpense(form, now)).ok).toBe(true);
    expect((await db.query("select receipt_path from expenses")).rows[0].receipt_path).toBeNull();
  });
});

describe("setMiles", () => {
  test("fills in miles, rejects nonsense", async () => {
    const { rows } = await db.query<{ id: string }>("insert into mileage (trip_on, note) values (current_date, 'Home visit') returning id");
    expect(await setMiles(rows[0].id, "12.5")).toEqual({ ok: true });
    expect(Number((await db.query("select miles from mileage")).rows[0].miles)).toBe(12.5);
    expect((await setMiles(rows[0].id, "-3")).ok).toBe(false);
    expect((await setMiles("not-a-uuid", "3")).ok).toBe(false);
    expect((await setMiles("00000000-0000-0000-0000-000000000000", "3")).ok).toBe(false);
  });
});

describe("recordRefund", () => {
  test("writes a refund dated today and caps at what was paid", async () => {
    const id = await paidBooking(2500);
    expect((await recordRefund(id, "10")).ok).toBe(true);
    const r = await db.query("select kind, amount_pence, occurred_on::text d from ledger where kind = 'refund'");
    expect(r.rows[0]).toMatchObject({ amount_pence: 1000, d: londonDateOf(new Date()) });
    expect((await recordRefund(id, "15.01")).ok).toBe(false);
    expect((await recordRefund(id, "15")).ok).toBe(true);
    expect((await db.query("select payment_status from bookings")).rows[0].payment_status).toBe("refunded");
    expect((await recordRefund(id, "1")).ok).toBe(false);
  });
  test("refunds on sessions of one block share a single cap", async () => {
    const blk = await db.query<{ id: string }>(
      `insert into block_bookings (parent_id, child_id, product, weeks, price_pence, status) values ($1,$2,'saturday',6,10000,'paid') returning id`, [parentId, childId]);
    const mk = async (days: number) =>
      (await db.query<{ id: string }>(
        `insert into bookings (parent_id, child_id, kind, location, starts_at, ends_at, busy_until, status, price_pence, payment_status, block_booking_id)
         values ($1,$2,'one_to_one','tutor_place', now() - make_interval(days => $4), now() - make_interval(days => $4) + interval '1 hour', now() - make_interval(days => $4) + interval '1 hour', 'attended', 2500, 'paid', $3) returning id`,
        [parentId, childId, blk.rows[0].id, days])).rows[0].id;
    const [s1, s2] = [await mk(1), await mk(2)];
    await db.query(`insert into ledger (block_booking_id, parent_id, kind, method, amount_pence, occurred_on) values ($1,$2,'payment','cash',10000,current_date)`, [blk.rows[0].id, parentId]);
    expect((await recordRefund(s1, "60")).ok).toBe(true);
    expect((await recordRefund(s2, "60")).ok).toBe(false);
    expect((await recordRefund(s2, "40")).ok).toBe(true);
    expect((await recordRefund(s1, "0.01")).ok).toBe(false);
    expect((await db.query("select count(*)::int n from ledger where kind='refund' and block_booking_id = $1", [blk.rows[0].id])).rows[0].n).toBe(2);
  });
  test("refunding a credited booking uses up that credit instead of leaving it to spend (R23)", async () => {
    const id = await paidBooking(2500);
    await db.query("update bookings set status = 'cancelled', payment_status = 'credited' where id = $1", [id]);
    await db.query("insert into ledger (booking_id, parent_id, kind, amount_pence, occurred_on) values ($1, $2, 'credit', 2500, current_date)", [id, parentId]);
    expect((await recordRefund(id, "25")).ok).toBe(true);
    const kinds = (await db.query("select kind::text, amount_pence from ledger order by kind::text")).rows;
    expect(kinds).toEqual([
      { kind: "credit", amount_pence: 2500 },
      { kind: "credit_applied", amount_pence: 2500 },
      { kind: "payment", amount_pence: 2500 },
      { kind: "refund", amount_pence: 2500 },
    ]);
    expect((await db.query("select credit_balance($1) as n", [parentId])).rows[0].n).toBe(0);
    expect((await db.query("select payment_status::text from bookings")).rows[0].payment_status).toBe("refunded");
  });
  test("a credit already spent cannot also be refunded", async () => {
    const id = await paidBooking(2500);
    await db.query("update bookings set status = 'cancelled', payment_status = 'credited' where id = $1", [id]);
    await db.query("insert into ledger (booking_id, parent_id, kind, amount_pence, occurred_on) values ($1, $2, 'credit', 2500, current_date)", [id, parentId]);
    await db.query("insert into ledger (parent_id, kind, amount_pence, occurred_on) values ($1, 'credit_applied', 2000, current_date)", [parentId]);
    const r = await recordRefund(id, "25");
    expect(r.ok).toBe(false);
    expect((await db.query("select 1 from ledger where kind = 'refund'")).rowCount).toBe(0);
    expect((await recordRefund(id, "5")).ok).toBe(true);
  });
  test("refuses an unpaid booking, bad amounts and unknown bookings", async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into bookings (parent_id, child_id, kind, location, starts_at, ends_at, busy_until, status, price_pence)
       values ($1,$2,'one_to_one','tutor_place', now(), now() + interval '1 hour', now() + interval '1 hour', 'confirmed', 2500) returning id`, [parentId, childId]);
    expect((await recordRefund(rows[0].id, "5")).ok).toBe(false);
    expect((await recordRefund(rows[0].id, "abc")).ok).toBe(false);
    expect((await recordRefund("nope", "5")).ok).toBe(false);
  });
});

describe("receipts bucket", () => {
  test("is private", async () => {
    expect((await db.query("select public from storage.buckets where id = 'receipts'")).rows[0].public).toBe(false);
  });
  test("only the verified admin can read or write objects", async () => {
    const admin = await createUser({ role: "admin" });
    const ins = "insert into storage.objects (bucket_id, name, owner_id) values ('receipts', $1, $2) returning id";
    const name = `receipts/2026/${crypto.randomUUID()}.jpg`;
    await expect(asUser(parentId, "aal2").query(ins, [name, parentId])).rejects.toThrow();
    await expect(asAnon().query(ins, [name, null])).rejects.toThrow();
    await expect(asUser(admin.id, "aal1").query(ins, [name, admin.id])).rejects.toThrow();
    await asUser(admin.id, "aal2").query(ins, [name, admin.id]);
    const sel = `select name from storage.objects where bucket_id = 'receipts' and name = '${name}'`;
    expect((await asUser(admin.id, "aal2").query(sel)).rowCount).toBe(1);
    expect((await asUser(parentId, "aal2").query(sel)).rowCount).toBe(0);
    expect((await asAnon().query(sel)).rowCount).toBe(0);
    expect((await asUser(admin.id, "aal1").query(sel)).rowCount).toBe(0);
  });
});
