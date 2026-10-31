import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { cancelBookingForParent } from "@/lib/booking/cancel";
import { closeDb, createChild, createUser, db, resetData } from "./setup";

const NOW = new Date("2026-11-10T12:00:00Z");
let parentId: string;
let childId: string;

async function insertBooking(opts: {
  starts: string;
  status?: string;
  location?: string;
  paymentStatus?: string;
  parent?: string;
}): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into bookings (parent_id, child_id, kind, location, starts_at, ends_at, busy_until, status,
                           price_pence, travel_fee_pence, payment_status)
     values ($1, $2, 'one_to_one', $3::location_kind, $4::timestamptz, $4::timestamptz + interval '1 hour',
             $4::timestamptz + interval '1 hour', $5::booking_status, 3000, 500, $6::payment_status)
     returning id`,
    [opts.parent ?? parentId, childId, opts.location ?? "online", opts.starts, opts.status ?? "confirmed", opts.paymentStatus ?? "paid"],
  );
  return rows[0].id;
}
const get = async (id: string) =>
  (await db.query("select status::text, payment_status::text, cancelled_at, cancelled_by from bookings where id = $1", [id])).rows[0];

beforeEach(async () => {
  await resetData();
  parentId = (await createUser()).id;
  childId = await createChild(parentId);
});
afterAll(closeDb);

describe("cancelBookingForParent", () => {
  test("another parent's booking is not found and untouched", async () => {
    const other = (await createUser()).id;
    const id = await insertBooking({ starts: "2026-11-20T10:00:00Z" });
    expect(await cancelBookingForParent(other, id, { now: NOW })).toEqual({ ok: false, reason: "not_found" });
    expect((await get(id)).status).toBe("confirmed");
    expect(await cancelBookingForParent(parentId, "not-a-uuid", { now: NOW })).toEqual({ ok: false, reason: "not_found" });
  });

  test("cancelled, past and attended bookings are refused", async () => {
    const cancelled = await insertBooking({ starts: "2026-11-20T10:00:00Z", status: "cancelled" });
    const past = await insertBooking({ starts: "2026-11-05T10:00:00Z" });
    const attended = await insertBooking({ starts: "2026-11-25T10:00:00Z", status: "attended" });
    for (const id of [cancelled, past, attended]) {
      expect(await cancelBookingForParent(parentId, id, { now: NOW, confirmLate: true })).toEqual({
        ok: false,
        reason: "not_cancellable",
      });
    }
    expect((await get(past)).status).toBe("confirmed");
    expect((await get(attended)).status).toBe("attended");
  });

  test("double cancel: the second call is refused and state does not change", async () => {
    const id = await insertBooking({ starts: "2026-11-20T10:00:00Z" });
    expect(await cancelBookingForParent(parentId, id, { now: NOW })).toMatchObject({ ok: true, outcome: "free" });
    const first = await get(id);
    expect(first).toMatchObject({ status: "cancelled", payment_status: "credited", cancelled_by: "parent" });
    expect(await cancelBookingForParent(parentId, id, { now: new Date(NOW.getTime() + 60_000) })).toEqual({
      ok: false,
      reason: "not_cancellable",
    });
    expect(await get(id)).toEqual(first);
  });

  test("late cancel needs confirmation, then records late_cancelled with the price-only fee", async () => {
    const id = await insertBooking({ starts: "2026-11-11T10:00:00Z", paymentStatus: "unpaid" });
    expect(await cancelBookingForParent(parentId, id, { now: NOW })).toEqual({
      ok: false,
      reason: "late_confirmation_needed",
      feePence: 3000,
    });
    expect((await get(id)).status).toBe("confirmed");
    expect(await cancelBookingForParent(parentId, id, { now: NOW, confirmLate: true })).toEqual({
      ok: true,
      outcome: "late",
      feePence: 3000,
    });
    expect(await get(id)).toMatchObject({ status: "late_cancelled", payment_status: "unpaid", cancelled_by: "parent" });
  });

  test("pending home visit inside 48h cancels free", async () => {
    const id = await insertBooking({ starts: "2026-11-11T10:00:00Z", status: "pending", location: "home_visit", paymentStatus: "unpaid" });
    expect(await cancelBookingForParent(parentId, id, { now: NOW })).toEqual({ ok: true, outcome: "free", feePence: 0 });
    expect((await get(id)).status).toBe("cancelled");
  });
});
