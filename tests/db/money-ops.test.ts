import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { addExpense, recordRefund, setMiles } from "@/lib/admin/money-ops";
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

describe("addExpense", () => {
  const form = { date: "2026-01-05", category: "stationery", description: "Pens", amount: "21.50" };
  test("saves pence, and a receipt privately under receipts/YYYY/uuid.ext", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "../../evil.php", { type: "image/jpeg" });
    expect(await addExpense({ ...form, receipt: file }, { now: new Date("2026-02-01T12:00:00Z") })).toEqual({ ok: true });
    const { rows } = await db.query("select amount_pence, receipt_path from expenses");
    expect(rows[0].amount_pence).toBe(2150);
    expect(rows[0].receipt_path).toMatch(/^receipts\/2026\/[0-9a-f-]{36}\.jpg$/);
    const obj = await db.query("select bucket_id from storage.objects where name = $1", [rows[0].receipt_path]);
    expect(obj.rows[0].bucket_id).toBe("receipts");
  });
  test("rejects bad receipts and bad amounts without saving", async () => {
    const now = { now: new Date("2026-02-01T12:00:00Z") };
    expect((await addExpense({ ...form, receipt: new File(["x"], "a.html", { type: "text/html" }) }, now)).ok).toBe(false);
    expect((await addExpense({ ...form, receipt: new File([new Uint8Array(10 * 1024 * 1024 + 1)], "a.png", { type: "image/png" }) }, now)).ok).toBe(false);
    expect((await addExpense({ ...form, amount: "x" }, now)).ok).toBe(false);
    expect((await db.query("select 1 from expenses")).rowCount).toBe(0);
  });
  test("works without a receipt", async () => {
    expect((await addExpense(form, { now: new Date("2026-02-01T12:00:00Z") })).ok).toBe(true);
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
