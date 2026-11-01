import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GET } from "@/app/api/cron/daily/route";
import { onBookingCancelled, onBookingCreated } from "@/lib/booking/notify";
import { sendEmail } from "@/lib/email/send";
import { closeDb, createChild, createUser, db, resetData } from "./setup";

let parent: { id: string; email: string };
let childId: string;
const H = 3600_000;

async function insertBooking(hoursAway: number, over: { location?: string; status?: string; kind?: string } = {}): Promise<string> {
  const starts = new Date(Date.now() + hoursAway * H).toISOString();
  const { rows } = await db.query<{ id: string }>(
    `insert into bookings (parent_id, child_id, kind, location, starts_at, ends_at, busy_until, status, price_pence, travel_fee_pence)
     values ($1, $2, $6::booking_kind, $3::location_kind, $4::timestamptz, $4::timestamptz + interval '1 hour',
             $4::timestamptz + interval '1 hour', $5::booking_status, 2500, 0) returning id`,
    [parent.id, childId, over.location ?? "tutor_place", starts, over.status ?? "confirmed", over.kind ?? "one_to_one"],
  );
  return rows[0].id;
}
const logged = async () =>
  (await db.query<{ template: string; to_email: string }>("select template, to_email from email_log order by template")).rows;
const cron = (secret = "s3cret") =>
  GET(new Request("http://localhost/api/cron/daily", { headers: { authorization: `Bearer ${secret}` } })).then((r) => r.json());

const env = { ...process.env };
let out: { mockRestore(): void; mock: { calls: unknown[][] } };
beforeEach(async () => {
  await resetData();
  parent = await createUser({ fullName: "Pat Parent" });
  childId = await createChild(parent.id);
  process.env.EMAIL_TRANSPORT = "log";
  process.env.CRON_SECRET = "s3cret";
  out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});
afterEach(() => {
  out.mockRestore();
  process.env = { ...env };
});
afterAll(closeDb);

const AN = { title: "New booking", lines: ["x"] };

describe("sendEmail", () => {
  test("is idempotent per booking and template, and writes the log transport to stdout", async () => {
    const id = await insertBooking(100);
    const args = { to: "a@example.test", template: "admin_new_booking", props: AN, bookingId: id } as const;
    expect(await sendEmail(args)).toBe("sent");
    expect(await sendEmail(args)).toBe("skipped");
    expect(await sendEmail({ ...args, template: "admin_late_cancellation" })).toBe("sent");
    expect((await logged()).length).toBe(2);
    const line = out.mock.calls.map((c) => String(c[0])).find((l) => l.includes('"subject":"New booking"'));
    expect(JSON.parse(line!).email).toMatchObject({ to: "a@example.test", subject: "New booking", template: "admin_new_booking" });
  });

  test("block-level emails are idempotent too (R14)", async () => {
    const { rows } = await db.query<{ id: string }>(
      "insert into block_bookings (parent_id, child_id, product, weeks, price_pence) values ($1, $2, 'saturday', 6, 10200) returning id",
      [parent.id, childId],
    );
    const args = { to: "a@example.test", template: "admin_block_hold_expired", props: AN, blockBookingId: rows[0].id } as const;
    expect(await sendEmail(args)).toBe("sent");
    expect(await sendEmail(args)).toBe("skipped");
    // Emails with no booking or block are never deduplicated.
    const plain = { to: "a@example.test", template: "admin_new_signup", props: AN } as const;
    expect(await sendEmail(plain)).toBe("sent");
    expect(await sendEmail(plain)).toBe("sent");
  });

  test("a transport failure removes the log row so a retry can send", async () => {
    const id = await insertBooking(100);
    const args = { to: "a@example.test", template: "admin_new_booking", props: AN, bookingId: id } as const;
    process.env.EMAIL_TRANSPORT = "resend";
    delete process.env.RESEND_API_KEY;
    await expect(sendEmail(args)).rejects.toThrow();
    expect((await logged()).length).toBe(0);
    process.env.EMAIL_TRANSPORT = "log";
    expect(await sendEmail(args)).toBe("sent");
  });
});

describe("booking hooks", () => {
  test("a new tutor_place booking emails the parent once and the business once", async () => {
    const id = await insertBooking(100);
    await onBookingCreated([id]);
    await onBookingCreated([id]);
    const rows = await logged();
    expect(rows).toEqual([
      { template: "admin_new_booking", to_email: expect.any(String) },
      { template: "booking_confirmed", to_email: parent.email },
    ]);
  });

  test("a pending home visit sends the 'needs approval' notice", async () => {
    const id = await insertBooking(100, { location: "home_visit", status: "pending" });
    await onBookingCreated([id]);
    expect((await logged()).map((r) => r.template)).toEqual(["admin_home_visit_request", "booking_confirmed"]);
  });

  test("a failing email never throws out of the hook", async () => {
    const id = await insertBooking(100);
    process.env.EMAIL_TRANSPORT = "resend";
    delete process.env.RESEND_API_KEY;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(onBookingCreated([id])).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  test("a late cancellation emails the parent and the business; a free one only the parent", async () => {
    const late = await insertBooking(100);
    const free = await insertBooking(200);
    await onBookingCancelled(late, "late");
    await onBookingCancelled(free, "free");
    expect((await logged()).map((r) => r.template)).toEqual([
      "admin_late_cancellation",
      "cancellation_receipt",
      "cancellation_receipt",
    ]);
  });
});

describe("daily cron", () => {
  test("sends due reminders once, plus block payment reminder and expired-hold notice", async () => {
    await insertBooking(30);
    await insertBooking(72);
    await insertBooking(40);
    await insertBooking(30, { status: "cancelled" });
    await db.query(
      `insert into block_bookings (parent_id, child_id, product, weeks, price_pence, created_at, hold_expires_at) values
         ($1, $2, 'saturday', 6, 10200, now() - interval '50 hours', now() + interval '22 hours'),
         ($1, $2, 'saturday', 6, 10200, now() - interval '80 hours', now() - interval '8 hours')`,
      [parent.id, childId],
    );
    const first = await cron();
    expect(first).toMatchObject({
      ok: true,
      freeCancelReminders: 1,
      lessonReminders: 1,
      blockPaymentReminders: 1,
      expiredBlockNotices: 1,
      failed: 0,
    });
    expect(first.groupSessionsCreated).toBeGreaterThanOrEqual(0);
    const second = await cron();
    expect(second).toMatchObject({ freeCancelReminders: 0, lessonReminders: 0, blockPaymentReminders: 0, expiredBlockNotices: 0, skipped: 4 });
    expect((await logged()).map((r) => r.template)).toEqual([
      "admin_block_hold_expired",
      "block_payment_reminder",
      "free_cancel_reminder",
      "lesson_reminder",
    ]);
  });

  test("rejects a wrong secret", async () => {
    const res = await GET(new Request("http://localhost/api/cron/daily", { headers: { authorization: "Bearer nope" } }));
    expect(res.status).toBe(401);
  });
});
