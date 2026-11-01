import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { addManualBooking } from "@/lib/admin/manual-booking";
import { approveStudent, addNote, setBlocked } from "@/lib/admin/family-ops";
import { decideHomeVisit, markAttended, markNoShow, recordLateCancellation, releaseBlock, tutorCancel } from "@/lib/admin/lifecycle";
import { familyCreditPence, markBlockPaid, markPaid, payFromCredit, waiveFee } from "@/lib/admin/payments";
import { testOutbox } from "@/lib/email/send";
import { londonDateOf } from "@/lib/time";
import { closeDb, createChild, createUser, db, resetData } from "./setup";

let parentId: string;
let childId: string;
let stdout: { mockRestore(): void; mock: { calls: unknown[][] } };
const H = 3600_000;

async function insertBooking(
  hoursAway: number,
  over: {
    status?: string;
    payment?: string;
    location?: string;
    kind?: string;
    price?: number;
    travel?: number;
    bundle?: string | null;
    block?: string | null;
    address?: string | null;
  } = {},
): Promise<string> {
  const starts = new Date(Date.now() + hoursAway * H).toISOString();
  const { rows } = await db.query<{ id: string }>(
    `insert into bookings (parent_id, child_id, kind, location, starts_at, ends_at, busy_until, status,
                           price_pence, travel_fee_pence, payment_status, bundle_id, block_booking_id, home_address)
     values ($1, $2, $3::booking_kind, $4::location_kind, $5::timestamptz, $5::timestamptz + interval '1 hour',
             $5::timestamptz + interval '1 hour', $6::booking_status, $7, $8, $9::payment_status, $10, $11, $12) returning id`,
    [
      parentId,
      childId,
      over.kind ?? "one_to_one",
      over.location ?? "tutor_place",
      starts,
      over.status ?? "confirmed",
      over.price ?? 2500,
      over.travel ?? 0,
      over.payment ?? "unpaid",
      over.bundle ?? null,
      over.block ?? null,
      over.address ?? null,
    ],
  );
  return rows[0].id;
}
const one = async <T,>(sql: string, args: unknown[] = []) => (await db.query(sql, args)).rows[0] as T;
const bookingRow = (id: string) =>
  one<{ status: string; payment_status: string; cancelled_by: string | null; cancelled_at: Date | null; decided_at: Date | null }>(
    "select status::text, payment_status::text, cancelled_by, cancelled_at, decided_at from bookings where id = $1",
    [id],
  );
const ledger = async () =>
  (await db.query<{ kind: string; amount_pence: number; method: string | null; occurred_on: string; booking_id: string | null; block_booking_id: string | null }>(
    "select kind::text, amount_pence, method::text, to_char(occurred_on, 'YYYY-MM-DD') as occurred_on, booking_id, block_booking_id from ledger order by created_at",
  )).rows;
const emails = async () => (await db.query<{ template: string }>("select template from email_log")).rows.map((r) => r.template);

beforeEach(async () => {
  await resetData();
  parentId = (await createUser({ fullName: "Pat Parent" })).id;
  childId = await createChild(parentId);
  stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true) as unknown as typeof stdout;
  testOutbox.length = 0;
});
afterEach(() => stdout.mockRestore());
afterAll(closeDb);

describe("payments", () => {
  test("markPaid writes one ledger payment of price plus travel, dated today in London", async () => {
    const id = await insertBooking(-5, { status: "attended", price: 3000, travel: 500, location: "home_visit", address: "1 Road" });
    expect(await markPaid(id, "bank_transfer")).toEqual({ ok: true });
    expect((await bookingRow(id)).payment_status).toBe("paid");
    expect(await ledger()).toEqual([
      { kind: "payment", amount_pence: 3500, method: "bank_transfer", occurred_on: londonDateOf(new Date()), booking_id: id, block_booking_id: null },
    ]);
  });

  test("occurred_on is the London date, not the UTC date", async () => {
    const id = await insertBooking(-5, { status: "attended" });
    // 00:30 London on 1 July 2026 (BST) is 23:30 UTC on 30 June.
    expect(await markPaid(id, "cash", { now: new Date("2026-06-30T23:30:00Z") })).toEqual({ ok: true });
    expect((await ledger())[0].occurred_on).toBe("2026-07-01");
  });

  test("a second mark-paid is refused and writes no second payment", async () => {
    const id = await insertBooking(-5, { status: "attended" });
    await markPaid(id, "cash");
    const again = await markPaid(id, "cash");
    expect(again.ok).toBe(false);
    expect(await ledger()).toHaveLength(1);
  });

  test("a late-cancelled lesson is paid at the 50% late fee (no travel)", async () => {
    const id = await insertBooking(-5, { status: "late_cancelled", price: 3000, travel: 500, location: "home_visit", address: "1 Road" });
    await markPaid(id, "bank_transfer");
    expect((await ledger())[0].amount_pence).toBe(1500);
  });

  test("cancelled and declined bookings owe nothing", async () => {
    for (const status of ["cancelled", "declined"]) {
      const id = await insertBooking(5 + (status === "cancelled" ? 0 : 3), { status });
      const r = await markPaid(id, "cash");
      expect(r.ok).toBe(false);
    }
    expect(await ledger()).toEqual([]);
  });

  test("a Sunday bundle row pays both rows with one ledger payment for the bundle total", async () => {
    const bundle = "11111111-1111-4111-8111-111111111111";
    const a = await insertBooking(-30, { status: "attended", price: 1500, bundle });
    const b = await insertBooking(-28, { status: "attended", price: 1500, bundle });
    expect(await markPaid(b, "bank_transfer")).toEqual({ ok: true });
    expect((await bookingRow(a)).payment_status).toBe("paid");
    expect((await bookingRow(b)).payment_status).toBe("paid");
    const l = await ledger();
    expect(l).toHaveLength(1);
    expect(l[0].amount_pence).toBe(3000);
    expect(l[0].booking_id).toBe(a);
  });

  async function heldBlock(price = 10200, weeks = 6) {
    const { rows } = await db.query<{ id: string }>(
      `insert into block_bookings (parent_id, child_id, product, weeks, price_pence, hold_expires_at, status)
       values ($1, $2, 'saturday', $3, $4, now() + interval '2 days', 'held') returning id`,
      [parentId, childId, weeks, price],
    );
    return rows[0].id;
  }

  test("markBlockPaid marks the block and every row paid with one ledger payment of the block price", async () => {
    const block = await heldBlock();
    const rows = [await insertBooking(48, { block, price: 1700 }), await insertBooking(48 + 168, { block, price: 1700 })];
    expect(await markBlockPaid(block, "bank_transfer")).toEqual({ ok: true });
    expect((await one<{ status: string }>("select status from block_bookings where id = $1", [block])).status).toBe("paid");
    for (const r of rows) expect((await bookingRow(r)).payment_status).toBe("paid");
    expect(await ledger()).toEqual([
      { kind: "payment", amount_pence: 10200, method: "bank_transfer", occurred_on: londonDateOf(new Date()), booking_id: null, block_booking_id: block },
    ]);
    expect((await markBlockPaid(block, "cash")).ok).toBe(false);
    expect(await ledger()).toHaveLength(1);
  });

  test("markBlockPaid records the block price less weeks cancelled for free (I3)", async () => {
    const block = await heldBlock(5100, 6);
    await insertBooking(48, { block, price: 1700 });
    const freed = await insertBooking(48 + 168, { block, price: 1700, status: "cancelled" });
    await insertBooking(48 + 336, { block, price: 1700, status: "late_cancelled" });
    expect(await markBlockPaid(block, "cash")).toEqual({ ok: true });
    expect((await ledger()).map((l) => l.amount_pence)).toEqual([3400]);
    // The week cancelled for free stays unpaid and cancelled: nothing was paid for it.
    expect(await bookingRow(freed)).toMatchObject({ status: "cancelled", payment_status: "unpaid" });
  });

  test("a row of a block cannot be paid on its own", async () => {
    const block = await heldBlock();
    const id = await insertBooking(48, { block, price: 1700 });
    expect((await markPaid(id, "cash")).ok).toBe(false);
    expect(await ledger()).toEqual([]);
  });

  test("a taught session of a released block can be paid on its own, once", async () => {
    const block = await heldBlock();
    const taught = await insertBooking(-48, { block, status: "attended", price: 1700, travel: 0 });
    await insertBooking(48, { block, price: 1700 });
    expect(await releaseBlock(block)).toEqual({ ok: true });
    expect(await markPaid(taught, "cash")).toEqual({ ok: true });
    expect((await bookingRow(taught)).payment_status).toBe("paid");
    expect(await ledger()).toMatchObject([{ kind: "payment", amount_pence: 1700, booking_id: taught, block_booking_id: null }]);
    expect((await markPaid(taught, "cash")).ok).toBe(false);
    expect(await ledger()).toHaveLength(1);
  });

  test("a pending home visit cannot be marked paid", async () => {
    const id = await insertBooking(48, { status: "pending", location: "home_visit", address: "1 Road" });
    expect((await markPaid(id, "cash")).ok).toBe(false);
    expect(await ledger()).toEqual([]);
  });

  test("waiveFee refuses rows that are not owed", async () => {
    const rows = [
      await insertBooking(48, { status: "cancelled" }),
      await insertBooking(100, { status: "declined" }),
      await insertBooking(150, { status: "pending", location: "home_visit", address: "x" }),
      await insertBooking(200, { status: "confirmed" }),
    ];
    for (const id of rows) expect((await waiveFee(id)).ok).toBe(false);
    expect(await ledger()).toEqual([]);
    const past = await insertBooking(-5, { status: "confirmed" });
    expect(await waiveFee(past)).toEqual({ ok: true });
  });

  test("waiveFee marks waived and writes a waiver for the amount owed", async () => {
    const id = await insertBooking(-5, { status: "late_cancelled", price: 2500, travel: 500 });
    expect(await waiveFee(id)).toEqual({ ok: true });
    expect((await bookingRow(id)).payment_status).toBe("waived");
    const l = await ledger();
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ kind: "waiver", amount_pence: 1250, booking_id: id });
    expect((await waiveFee(id)).ok).toBe(false);
  });

  test("waive sets owed 0", async () => {
    const id = await insertBooking(-5, { status: "no_show", price: 2500, travel: 500, location: "home_visit", address: "1 Road" });
    expect(await waiveFee(id)).toEqual({ ok: true });
    expect(await one<{ fee_pence: number }>("select fee_pence from bookings where id = $1", [id])).toEqual({ fee_pence: 0 });
  });
});

/** Make a booking look like it was made `days` ago (the default insert is "now", i.e. inside the cooling-off). */
const madeDaysAgo = (id: string, days: number) =>
  db.query("update bookings set created_at = now() - make_interval(days => $2) where id = $1", [id, days]);
const feeOf = async (id: string) => (await one<{ fee_pence: number | null }>("select fee_pence from bookings where id = $1", [id])).fee_pence;

describe("recordLateCancellation", () => {
  test("admin late cancel unpaid 1-to-1 -> late_cancelled, fee 1250 owed", async () => {
    const id = await insertBooking(10, { price: 2500 });
    await madeDaysAgo(id, 30);
    expect(await recordLateCancellation(id)).toEqual({ ok: true });
    expect(await bookingRow(id)).toMatchObject({ status: "late_cancelled", payment_status: "unpaid", cancelled_by: "parent" });
    expect(await feeOf(id)).toBe(1250);
    expect(await ledger()).toEqual([]);
    expect(await emails()).toContain("cancellation_receipt");
    expect(JSON.stringify(testOutbox)).not.toMatch(/penalty|fine\b|waiver/i);
  });

  test("admin late cancel paid 1-to-1 -> fee 1250, credit 1250, stays paid", async () => {
    const id = await insertBooking(10, { price: 2500, payment: "paid" });
    await madeDaysAgo(id, 30);
    expect(await recordLateCancellation(id)).toEqual({ ok: true });
    expect(await bookingRow(id)).toMatchObject({ status: "late_cancelled", payment_status: "paid" });
    expect(await feeOf(id)).toBe(1250);
    const l = await ledger();
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ kind: "credit", amount_pence: 1250, booking_id: id });
  });

  test("paid home visit: credit is price + travel - fee", async () => {
    const id = await insertBooking(10, { price: 2500, travel: 500, location: "home_visit", address: "1 Road", payment: "paid" });
    await madeDaysAgo(id, 30);
    expect(await recordLateCancellation(id)).toEqual({ ok: true });
    expect((await ledger())[0]).toMatchObject({ kind: "credit", amount_pence: 1750 });
  });

  test("admin late cancel within cooling-off -> cancelled free, paid becomes credit", async () => {
    const free = await insertBooking(10, { payment: "paid" });
    expect(await recordLateCancellation(free)).toEqual({ ok: true });
    expect(await bookingRow(free)).toMatchObject({ status: "cancelled", payment_status: "credited", cancelled_by: "parent" });
    expect(await feeOf(free)).toBeNull();
    expect((await ledger())[0]).toMatchObject({ kind: "credit", amount_pence: 2500 });
  });

  test("uses the Settings late fee percent", async () => {
    await db.query("update settings set late_fee_percent = 40");
    const id = await insertBooking(10, { price: 2500 });
    await madeDaysAgo(id, 30);
    await recordLateCancellation(id);
    expect(await feeOf(id)).toBe(1000);
    await db.query("update settings set late_fee_percent = 50");
  });

  test("refuses finished, already cancelled and pass-seat bookings", async () => {
    const done = await insertBooking(-5, { status: "attended" });
    const gone = await insertBooking(10, { status: "cancelled" });
    expect((await recordLateCancellation(done)).ok).toBe(false);
    expect((await recordLateCancellation(gone)).ok).toBe(false);
    const seat = await insertBooking(10);
    const pass = await db.query<{ id: string }>(
      "insert into passes (parent_id, child_id, level, sessions_total, price_pence) values ($1, $2, 'GCSE', 6, 10200) returning id",
      [parentId, childId],
    );
    await db.query("update bookings set pass_id = $1 where id = $2", [pass.rows[0].id, seat]);
    const r = await recordLateCancellation(seat);
    expect(r.ok).toBe(false);
    expect((await bookingRow(seat)).status).toBe("confirmed");
  });
});

describe("markNoShow fees", () => {
  test("no_show home visit owes 1250+500", async () => {
    const id = await insertBooking(-3, { price: 2500, travel: 500, location: "home_visit", address: "1 Road" });
    expect(await markNoShow(id)).toEqual({ ok: true });
    expect(await feeOf(id)).toBe(1250);
    const { dueFor } = await import("@/lib/admin/payments");
    const row = await one<{ fee_pence: number }>("select fee_pence from bookings where id = $1", [id]);
    expect(dueFor({ status: "no_show", location: "home_visit", pricePence: 2500, travelFeePence: 500, feePence: row.fee_pence })).toBe(1750);
  });

  test("a paid no-show credits the difference", async () => {
    const id = await insertBooking(-3, { price: 2500, travel: 0, payment: "paid" });
    expect(await markNoShow(id)).toEqual({ ok: true });
    expect((await ledger())[0]).toMatchObject({ kind: "credit", amount_pence: 1250, booking_id: id });
    expect((await bookingRow(id)).payment_status).toBe("paid");
  });

  test("a paid home-visit no-show credits price minus fee (travel is still owed)", async () => {
    const id = await insertBooking(-3, { price: 2500, travel: 500, location: "home_visit", address: "1 Road", payment: "paid" });
    await markNoShow(id);
    expect((await ledger())[0]).toMatchObject({ kind: "credit", amount_pence: 1250 });
  });
});

describe("pay from credit (R23)", () => {
  async function credit(amount: number, parent = parentId) {
    await db.query(
      "insert into ledger (parent_id, kind, amount_pence, occurred_on, note) values ($1, 'credit', $2, current_date, 'test')",
      [parent, amount],
    );
  }
  async function heldBlock(price: number) {
    const { rows } = await db.query<{ id: string }>(
      `insert into block_bookings (parent_id, child_id, product, weeks, price_pence, hold_expires_at, status)
       values ($1, $2, 'saturday', 6, $3, now() + interval '2 days', 'held') returning id`,
      [parentId, childId, price],
    );
    return rows[0].id;
  }

  test("the family credit is credit issued minus credit applied", async () => {
    await credit(2500);
    await credit(1000);
    expect(await familyCreditPence(parentId)).toBe(3500);
  });

  test("pays an upcoming unpaid booking without a payment row, and reduces the balance", async () => {
    await credit(3000);
    const id = await insertBooking(48, { price: 2500, travel: 500, location: "home_visit", address: "1 Road" });
    expect(await payFromCredit(id, { now: new Date("2026-06-30T23:30:00Z") })).toEqual({ ok: true });
    expect((await bookingRow(id)).payment_status).toBe("paid");
    const l = await ledger();
    expect(l.filter((r) => r.kind === "payment")).toEqual([]);
    expect(l.find((r) => r.kind === "credit_applied")).toMatchObject({ amount_pence: 3000, booking_id: id, occurred_on: "2026-07-01" });
    expect(await familyCreditPence(parentId)).toBe(0);
    // Twice is refused.
    expect((await payFromCredit(id)).ok).toBe(false);
  });

  test("a late-cancelled lesson is paid from credit at the 50% late fee (no travel)", async () => {
    await credit(2500);
    const id = await insertBooking(-5, { status: "late_cancelled", price: 2500, travel: 500, location: "home_visit", address: "1 Road" });
    expect(await payFromCredit(id)).toEqual({ ok: true });
    expect(await familyCreditPence(parentId)).toBe(1250);
  });

  test("refused when the balance is not enough, and nothing changes", async () => {
    await credit(2000);
    const id = await insertBooking(48, { price: 2500 });
    const r = await payFromCredit(id);
    expect(r).toEqual({ ok: false, message: "This family has £20 of credit, which does not cover £25." });
    expect((await bookingRow(id)).payment_status).toBe("unpaid");
    expect((await ledger()).filter((l) => l.kind === "credit_applied")).toEqual([]);
  });

  test("another family's credit cannot be used", async () => {
    const other = (await createUser()).id;
    await credit(5000, other);
    const id = await insertBooking(48, { price: 2500 });
    expect((await payFromCredit(id)).ok).toBe(false);
    expect(await familyCreditPence(other)).toBe(5000);
  });

  test("refuses cancelled, declined, pending home visits and paid bookings", async () => {
    await credit(10000);
    const rows = [
      await insertBooking(48, { status: "cancelled" }),
      await insertBooking(100, { status: "declined" }),
      await insertBooking(150, { status: "pending", location: "home_visit", address: "x" }),
      await insertBooking(200, { payment: "paid" }),
    ];
    for (const id of rows) expect((await payFromCredit(id)).ok).toBe(false);
    expect(await familyCreditPence(parentId)).toBe(10000);
  });

  test("a week of a held block pays the whole block from credit, at its amount due (I3)", async () => {
    await credit(5000);
    const block = await heldBlock(5100);
    const a = await insertBooking(48, { block, price: 1700 });
    await insertBooking(48 + 168, { block, price: 1700 });
    await insertBooking(48 + 336, { block, price: 1700, status: "cancelled" });
    expect(await payFromCredit(a)).toEqual({ ok: true });
    expect((await one<{ status: string }>("select status from block_bookings where id = $1", [block])).status).toBe("paid");
    expect((await ledger()).find((l) => l.kind === "credit_applied")).toMatchObject({ amount_pence: 3400, block_booking_id: block });
    expect(await familyCreditPence(parentId)).toBe(1600);
  });

  test("two applications at once cannot overspend the balance", async () => {
    await credit(2500);
    const a = await insertBooking(48, { price: 2500 });
    const b = await insertBooking(96, { price: 2500 });
    const results = await Promise.all([payFromCredit(a), payFromCredit(b)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await familyCreditPence(parentId)).toBe(0);
    const paid = (await db.query("select id from bookings where payment_status = 'paid'")).rows;
    expect(paid).toHaveLength(1);
  });
});

describe("attendance", () => {
  test("markAttended and markNoShow need a started, confirmed lesson", async () => {
    const past = await insertBooking(-3);
    const future = await insertBooking(30);
    const pending = await insertBooking(-10, { status: "pending", location: "home_visit", address: "x" });
    expect(await markAttended(past)).toEqual({ ok: true });
    expect((await bookingRow(past)).status).toBe("attended");
    expect((await markAttended(future)).ok).toBe(false);
    expect((await markNoShow(future)).ok).toBe(false);
    expect((await markAttended(pending)).ok).toBe(false);
    expect((await markNoShow(past)).ok).toBe(false); // already attended
    const miss = await insertBooking(-20);
    expect(await markNoShow(miss)).toEqual({ ok: true });
    expect((await bookingRow(miss)).status).toBe("no_show");
  });
});

describe("tutorCancel", () => {
  test("unpaid: cancelled by tutor, no ledger, emails the parent", async () => {
    const id = await insertBooking(30);
    expect(await tutorCancel(id, false)).toEqual({ ok: true });
    const r = await bookingRow(id);
    expect(r.status).toBe("cancelled");
    expect(r.cancelled_by).toBe("tutor");
    expect(r.cancelled_at).not.toBeNull();
    expect(await ledger()).toEqual([]);
    expect(await emails()).toEqual(["cancellation_receipt"]);
    const out = JSON.stringify(testOutbox);
    expect(out).toContain("cancelled");
    expect(out).not.toContain("late cancellation fee");
  });

  test("paid + refund writes a refund and marks refunded", async () => {
    const id = await insertBooking(30, { payment: "paid", price: 2500, travel: 500 });
    await tutorCancel(id, true);
    expect((await bookingRow(id)).payment_status).toBe("refunded");
    expect(await ledger()).toMatchObject([{ kind: "refund", amount_pence: 3000, booking_id: id }]);
  });

  test("paid + no refund writes a credit and marks credited", async () => {
    const id = await insertBooking(30, { payment: "paid", price: 2500 });
    await tutorCancel(id, false);
    expect((await bookingRow(id)).payment_status).toBe("credited");
    expect(await ledger()).toMatchObject([{ kind: "credit", amount_pence: 2500 }]);
  });

  test("an already cancelled or attended booking is refused", async () => {
    const a = await insertBooking(30, { status: "cancelled" });
    const b = await insertBooking(-3, { status: "attended" });
    expect((await tutorCancel(a, false)).ok).toBe(false);
    expect((await tutorCancel(b, false)).ok).toBe(false);
  });

  test("an email failure does not undo the cancellation", async () => {
    const before = { t: process.env.EMAIL_TRANSPORT, k: process.env.RESEND_API_KEY };
    process.env.EMAIL_TRANSPORT = "resend"; // no API key: sending throws
    delete process.env.RESEND_API_KEY;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const id = await insertBooking(30);
      expect(await tutorCancel(id, false)).toEqual({ ok: true });
      expect((await bookingRow(id)).status).toBe("cancelled");
      expect(err).toHaveBeenCalled();
    } finally {
      err.mockRestore();
      process.env.EMAIL_TRANSPORT = before.t;
      if (before.k) process.env.RESEND_API_KEY = before.k;
    }
  });
});

describe("decideHomeVisit", () => {
  async function request() {
    return insertBooking(24 * 5, { status: "pending", location: "home_visit", address: "7 Elm Street, Blackburn", price: 2500, travel: 500 });
  }
  test("approve confirms, records a mileage row with null miles, and emails the family", async () => {
    const id = await request();
    expect(await decideHomeVisit(id, true)).toEqual({ ok: true });
    const r = await bookingRow(id);
    expect(r.status).toBe("confirmed");
    expect(r.decided_at).not.toBeNull();
    const m = await db.query<{ booking_id: string; miles: string | null; trip_on: string }>(
      "select booking_id, miles, to_char(trip_on, 'YYYY-MM-DD') as trip_on from mileage",
    );
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0].booking_id).toBe(id);
    expect(m.rows[0].miles).toBeNull();
    const when = (await one<{ s: Date }>("select starts_at as s from bookings where id = $1", [id])).s;
    expect(m.rows[0].trip_on).toBe(londonDateOf(when));
    expect(await emails()).toEqual(["home_visit_decision"]);
    const out = JSON.stringify(testOutbox);
    expect(out).toContain("7 Elm Street");
    // Booked just now for 5 days ahead: the whole run-up is inside the 14-day cooling-off (R20).
    expect(out).toContain("within your 14-day cooling-off period");
    expect(out).not.toContain("late cancellation fee of £25");
  });
  test("decline marks declined and sends a friendly email, no mileage", async () => {
    const id = await request();
    expect(await decideHomeVisit(id, false)).toEqual({ ok: true });
    expect((await bookingRow(id)).status).toBe("declined");
    expect((await db.query("select 1 from mileage")).rowCount).toBe(0);
    expect(await emails()).toEqual(["home_visit_decision"]);
  });
  test("deciding twice, or on a non-pending booking, is refused", async () => {
    const id = await request();
    await decideHomeVisit(id, true);
    expect((await decideHomeVisit(id, true)).ok).toBe(false);
    expect((await decideHomeVisit(id, false)).ok).toBe(false);
    expect((await db.query("select 1 from mileage")).rowCount).toBe(1);
    const lesson = await insertBooking(50, { status: "pending" });
    expect((await decideHomeVisit(lesson, true)).ok).toBe(false);
  });
});

describe("approveStudent", () => {
  test("is refused until an assessment booking is attended, then sets approved_at", async () => {
    const a = await insertBooking(-3, { kind: "assessment" });
    const early = await approveStudent(childId);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.message).toMatch(/attended/i);
    expect((await db.query("select 1 from student_status where approved_at is not null")).rowCount).toBe(0);

    await markAttended(a);
    expect(await approveStudent(childId)).toEqual({ ok: true });
    const s = await one<{ approved_at: Date | null; assessment_completed_at: Date | null }>(
      "select approved_at, assessment_completed_at from student_status where child_id = $1",
      [childId],
    );
    expect(s.approved_at).not.toBeNull();
    expect(s.assessment_completed_at).not.toBeNull();
  });
  test("a one-to-one attended lesson does not count", async () => {
    await insertBooking(-3, { status: "attended", kind: "one_to_one" });
    expect((await approveStudent(childId)).ok).toBe(false);
  });
  test("keeps an existing assessment_completed_at", async () => {
    await insertBooking(-3, { status: "attended", kind: "assessment" });
    await db.query("insert into student_status (child_id, assessment_completed_at) values ($1, '2026-01-02T10:00:00Z')", [childId]);
    await approveStudent(childId);
    const s = await one<{ c: string }>("select assessment_completed_at::text as c from student_status where child_id = $1", [childId]);
    expect(s.c).toContain("2026-01-02");
  });
});

describe("family ops", () => {
  test("setBlocked sets and clears the block and reason", async () => {
    expect(await setBlocked(parentId, true, "  owes money  ")).toEqual({ ok: true });
    expect(await one("select is_blocked, blocked_reason from profiles where id = $1", [parentId])).toEqual({
      is_blocked: true,
      blocked_reason: "owes money",
    });
    await setBlocked(parentId, false, "ignored");
    expect(await one("select is_blocked, blocked_reason from profiles where id = $1", [parentId])).toEqual({
      is_blocked: false,
      blocked_reason: null,
    });
  });
  test("setBlocked refuses an admin account", async () => {
    const admin = await createUser({ role: "admin" });
    expect((await setBlocked(admin.id, true, "x")).ok).toBe(false);
  });
  test("addNote stores a trimmed note and refuses an empty one", async () => {
    expect(await addNote(childId, "  Struggles with moles  ")).toEqual({ ok: true });
    expect((await db.query("select body from tutor_notes")).rows).toEqual([{ body: "Struggles with moles" }]);
    expect((await addNote(childId, "   ")).ok).toBe(false);
  });
});

describe("releaseBlock", () => {
  test("releases a held block and cancels its future bookings by the tutor", async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into block_bookings (parent_id, child_id, product, weeks, price_pence, hold_expires_at, status)
       values ($1, $2, 'saturday', 6, 10200, now() - interval '1 day', 'held') returning id`,
      [parentId, childId],
    );
    const block = rows[0].id;
    const future = await insertBooking(48, { block });
    const past = await insertBooking(-48, { block, status: "attended" });
    expect(await releaseBlock(block)).toEqual({ ok: true });
    expect((await one<{ status: string }>("select status from block_bookings where id = $1", [block])).status).toBe("released");
    expect(await bookingRow(future)).toMatchObject({ status: "cancelled", cancelled_by: "tutor" });
    expect((await bookingRow(past)).status).toBe("attended");
  });
  test("a paid block is refused", async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into block_bookings (parent_id, child_id, product, weeks, price_pence, status)
       values ($1, $2, 'saturday', 6, 10200, 'paid') returning id`,
      [parentId, childId],
    );
    expect((await releaseBlock(rows[0].id)).ok).toBe(false);
  });
});

describe("addManualBooking", () => {
  test("creates a confirmed booking priced by quote(), with no eligibility rules (unapproved child, odd time, online)", async () => {
    const r = await addManualBooking({ parentId, childId, kind: "one_to_one", location: "online", date: "2027-03-02", time: "07:00" });
    expect(r.ok).toBe(true);
    const b = await one<{ status: string; price_pence: number; travel_fee_pence: number; starts_at: Date }>(
      "select status::text, price_pence, travel_fee_pence, starts_at from bookings",
    );
    expect(b.status).toBe("confirmed");
    expect(b.price_pence).toBe(2500);
    expect(b.travel_fee_pence).toBe(0);
    expect(b.starts_at.toISOString()).toBe("2027-03-02T07:00:00.000Z");
  });
  test("emails the family a confirmation with the reference (R25)", async () => {
    const r = await addManualBooking({ parentId, childId, kind: "one_to_one", location: "tutor_place", date: "2027-03-02", time: "18:00" });
    expect(r.ok).toBe(true);
    expect(await emails()).toContain("booking_confirmed");
    const ref = (await one<{ payment_reference: string }>("select payment_reference from bookings")).payment_reference;
    expect(testOutbox.find((e) => e.template === "booking_confirmed")?.text).toContain(ref);
  });
  test("an email failure does not undo a manual booking", async () => {
    const before = { t: process.env.EMAIL_TRANSPORT, k: process.env.RESEND_API_KEY };
    process.env.EMAIL_TRANSPORT = "resend";
    delete process.env.RESEND_API_KEY;
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const r = await addManualBooking({ parentId, childId, kind: "one_to_one", location: "tutor_place", date: "2027-03-03", time: "18:00" });
      expect(r.ok).toBe(true);
      expect((await db.query("select 1 from bookings")).rowCount).toBe(1);
    } finally {
      err.mockRestore();
      process.env.EMAIL_TRANSPORT = before.t;
      if (before.k !== undefined) process.env.RESEND_API_KEY = before.k;
    }
  });
  test("a home visit adds travel, a buffer, and a mileage row", async () => {
    const r = await addManualBooking({
      parentId, childId, kind: "assessment", location: "home_visit", date: "2027-03-07", time: "10:00",
      homeAddress: "1 Road", postcode: "BB1 1AA",
    });
    expect(r.ok).toBe(true);
    const b = await one<{ price_pence: number; travel_fee_pence: number; busy_until: Date; ends_at: Date }>(
      "select price_pence, travel_fee_pence, busy_until, ends_at from bookings",
    );
    expect([b.price_pence, b.travel_fee_pence]).toEqual([1000, 500]);
    expect(b.busy_until.getTime()).toBeGreaterThan(b.ends_at.getTime());
    expect((await db.query("select 1 from mileage")).rowCount).toBe(1);
  });
  test("summer time is read as London time", async () => {
    await addManualBooking({ parentId, childId, kind: "one_to_one", location: "tutor_place", date: "2027-07-05", time: "10:00" });
    const b = await one<{ s: Date }>("select starts_at as s from bookings");
    expect(b.s.toISOString()).toBe("2027-07-05T09:00:00.000Z");
  });
  test("an overlap is refused with a friendly message", async () => {
    const input = { parentId, childId, kind: "one_to_one" as const, location: "tutor_place" as const, date: "2027-03-02", time: "10:00" };
    expect((await addManualBooking(input)).ok).toBe(true);
    const clash = await addManualBooking({ ...input, time: "10:30" });
    expect(clash).toEqual({ ok: false, message: "That time overlaps another booking." });
  });
  test("a child that is not the parent's is refused", async () => {
    const other = (await createUser()).id;
    const r = await addManualBooking({ parentId: other, childId, kind: "one_to_one", location: "online", date: "2027-03-02", time: "10:00" });
    expect(r.ok).toBe(false);
  });
});
