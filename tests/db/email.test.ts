import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GET } from "@/app/api/cron/daily/route";
import { onBookingCancelled, onBookingCreated } from "@/lib/booking/notify";
import { sendEmail, testOutbox } from "@/lib/email/send";
import { closeDb, createChild, createUser, db, resetData } from "./setup";

let parent: { id: string; email: string };
let childId: string;
const H = 3600_000;

async function insertBooking(hoursAway: number, over: { location?: string; status?: string; kind?: string } = {}): Promise<string> {
  const starts = new Date(Date.now() + hoursAway * H).toISOString();
  const { rows } = await db.query<{ id: string }>(
    // Booked a month ago, so the 14-day cooling-off (R20) doesn't change the reminders.
    `insert into bookings (parent_id, child_id, kind, location, starts_at, ends_at, busy_until, status, price_pence, travel_fee_pence, created_at)
     values ($1, $2, $6::booking_kind, $3::location_kind, $4::timestamptz, $4::timestamptz + interval '1 hour',
             $4::timestamptz + interval '1 hour', $5::booking_status, 2500, 0, now() - interval '30 days') returning id`,
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
  testOutbox.length = 0;
});
afterEach(() => {
  out.mockRestore();
  process.env = { ...env };
});
afterAll(closeDb);

const AN = { title: "New booking", lines: ["x"] };

describe("sendEmail", () => {
  test("is idempotent per booking and template; the log transport prints only the template and domain", async () => {
    const id = await insertBooking(100);
    const args = { to: "a@example.test", template: "admin_new_booking", props: AN, bookingId: id } as const;
    expect(await sendEmail(args)).toBe("sent");
    expect(await sendEmail(args)).toBe("skipped");
    expect(await sendEmail({ ...args, template: "admin_late_cancellation" })).toBe("sent");
    expect((await logged()).length).toBe(2);
    const lines = out.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('"email"'));
    expect(lines.map((l) => JSON.parse(l))).toContainEqual({ email: { template: "admin_new_booking", toDomain: "example.test" } });
    // The body, subject and address never reach the log (review I4).
    expect(lines.join("")).not.toContain("New booking");
    expect(lines.join("")).not.toContain("a@example.test");
    expect(testOutbox.find((e) => e.template === "admin_new_booking")).toMatchObject({ to: "a@example.test", subject: "New booking" });
  });

  test("pass-level emails are idempotent too", async () => {
    const { rows } = await db.query<{ id: string }>(
      "insert into passes (parent_id, child_id, level, sessions_total, price_pence) values ($1, $2, 'GCSE', 6, 10200) returning id",
      [parent.id, childId],
    );
    const args = { to: "a@example.test", template: "admin_new_pass", props: AN, passId: rows[0].id } as const;
    expect(await sendEmail(args)).toBe("sent");
    expect(await sendEmail(args)).toBe("skipped");
    // Emails with no booking or pass are never deduplicated.
    const plain = { to: "a@example.test", template: "admin_new_signup", props: AN } as const;
    expect(await sendEmail(plain)).toBe("sent");
    expect(await sendEmail(plain)).toBe("sent");
  });

  test("subjects lose line breaks and are capped at 150 characters; reply-to is passed on", async () => {
    const props = { name: `Lee\r\nBcc: evil@example.test ${"x".repeat(200)}`, email: "lee@example.test", phone: null, message: "Hi" };
    expect(await sendEmail({ to: "inbox@example.test", template: "contact_message", props, replyTo: "lee@example.test" })).toBe("sent");
    // Contact messages have no booking, so the same one twice is sent twice.
    expect(await sendEmail({ to: "inbox@example.test", template: "contact_message", props, replyTo: "lee@example.test" })).toBe("sent");
    expect((await logged()).filter((l) => l.template === "contact_message")).toHaveLength(2);
    const email = testOutbox.find((e) => e.template === "contact_message")!;
    expect(email.subject).not.toMatch(/[\r\n]/);
    expect(email.subject.startsWith("Contact form: Lee Bcc: evil@example.test")).toBe(true);
    expect(email.subject.length).toBeLessThanOrEqual(150);
    expect(email.replyTo).toBe("lee@example.test");
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
  test("sends due reminders once, plus a pass payment reminder and pass expiry", async () => {
    await insertBooking(30);
    await insertBooking(72);
    await insertBooking(40);
    await insertBooking(30, { status: "cancelled" });
    await db.query(
      `insert into passes (parent_id, child_id, level, sessions_total, price_pence, status, created_at, paid_at, expires_at) values
         ($1, $2, 'GCSE', 6, 10200, 'awaiting_payment', now() - interval '50 hours', null, null),
         ($1, $2, 'GCSE', 6, 10200, 'awaiting_payment', now() - interval '20 hours', null, null),
         ($1, $2, 'GCSE', 6, 10200, 'active', now() - interval '200 days', now() - interval '190 days', now() - interval '1 day')`,
      [parent.id, childId],
    );
    const first = await cron();
    expect(first).toMatchObject({
      ok: true,
      freeCancelReminders: 1,
      lessonReminders: 1,
      passPaymentReminders: 1,
      passesExpired: 1,
      failed: 0,
    });
    expect(first.groupSessionsCreated).toBeGreaterThanOrEqual(0);
    const second = await cron();
    expect(second).toMatchObject({ freeCancelReminders: 0, lessonReminders: 0, passPaymentReminders: 0, passesExpired: 0, skipped: 2 });
    expect((await logged()).map((r) => r.template)).toEqual(["free_cancel_reminder", "lesson_reminder", "pass_payment_reminder"]);
    expect((await db.query("select status from passes order by created_at")).rows.map((r) => r.status)).toEqual([
      "expired",
      "awaiting_payment",
      "awaiting_payment",
    ]);
  });

  test("uses the notice period from settings for the free-cancel reminder (R25)", async () => {
    await db.query("update settings set cancellation_notice_hours = 72");
    try {
      const far = await insertBooking(100); // inside (72, 120]; outside the default (48, 96]
      await insertBooking(60); // inside the default window, but already inside a 72-hour notice
      const res = await cron();
      expect(res).toMatchObject({ freeCancelReminders: 1, failed: 0 });
      const { rows } = await db.query("select booking_id from email_log where template = 'free_cancel_reminder'");
      expect(rows).toEqual([{ booking_id: far }]);
    } finally {
      await db.query("update settings set cancellation_notice_hours = 48");
    }
  });

  test("rejects a wrong secret", async () => {
    const res = await GET(new Request("http://localhost/api/cron/daily", { headers: { authorization: "Bearer nope" } }));
    expect(res.status).toBe(401);
  });
});
