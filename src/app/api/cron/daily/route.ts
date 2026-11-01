import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runPassCron } from "@/lib/booking/pass-service";
import { bankDetails, buildLines, loadBookings, loadPeople } from "@/lib/email/notifications";
import { dueReminders } from "@/lib/email/reminders";
import { sendEmail } from "@/lib/email/send";
import { createServiceClient } from "@/lib/supabase/service";
import { addDays, londonDateOf } from "@/lib/time";

export const dynamic = "force-dynamic";

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${secret}`);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

/**
 * Vercel Cron (07:00 daily). Sends due reminders and group-pass payment
 * reminders (all idempotent through email_log), marks expired passes, then
 * makes sure group sessions exist 12 weeks ahead. Doing a database round trip also keeps the Supabase project awake.
 */
export async function GET(request: Request): Promise<Response> {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const now = new Date();
  const c = createServiceClient();
  const counts = {
    freeCancelReminders: 0,
    lessonReminders: 0,
    passPaymentReminders: 0,
    passesExpired: 0,
    skipped: 0,
    failed: 0,
    groupSessionsCreated: 0,
  };
  const tally = (r: "sent" | "skipped", key: "freeCancelReminders" | "lessonReminders") => {
    if (r === "sent") counts[key]++;
    else counts.skipped++;
  };
  const guard = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      counts.failed++;
      console.error(`cron: ${label} failed`, err);
    }
  };

  // Reminders: confirmed bookings starting within the notice period (from settings) plus 48 hours.
  await guard("reminders", async () => {
    const priv = await bankDetails();
    const { data, error } = await c
      .from("bookings")
      .select("id")
      .eq("status", "confirmed")
      .gt("starts_at", now.toISOString())
      .lte("starts_at", new Date(now.getTime() + (Math.max(priv.noticeHours, 0) + 48) * 3600_000).toISOString());
    if (error) throw new Error(error.message);
    const bookings = await loadBookings(c, (data as { id: string }[]).map((r) => r.id));
    const due = dueReminders(bookings, now, priv.noticeHours);
    if (due.length === 0) return;
    const byId = new Map(bookings.map((b) => [b.id, b]));
    const lines = await buildLines(c, bookings);
    const people = await loadPeople(c, bookings.map((b) => b.parentId));
    for (const r of due) {
      await guard(`${r.template} ${r.bookingId}`, async () => {
        const b = byId.get(r.bookingId)!;
        const parent = b.parentId ? people.get(b.parentId) : undefined;
        if (!parent) return;
        const props = {
          parentName: parent.name,
          session: lines.get(b.id)!,
          teachingAddress: priv.teachingAddress,
          meetingLink: priv.meetingLink,
          noticeHours: priv.noticeHours,
        };
        if (r.template === "free_cancel_reminder") {
          tally(await sendEmail({ to: parent.email, template: "free_cancel_reminder", props, bookingId: b.id }), "freeCancelReminders");
        } else {
          tally(await sendEmail({ to: parent.email, template: "lesson_reminder", props, bookingId: b.id }), "lessonReminders");
        }
      });
    }
  });

  // Group passes: one payment reminder 48 h after buying, and expiry.
  await guard("passes", async () => {
    const r = await runPassCron(now);
    counts.passPaymentReminders = r.reminders;
    counts.passesExpired = r.expired;
    counts.failed += r.failed;
  });

  await guard("group sessions", async () => {
    const until = addDays(londonDateOf(now), 84);
    const { data, error } = await c.rpc("ensure_group_sessions", { p_until: until });
    if (error) throw new Error(error.message);
    counts.groupSessionsCreated = typeof data === "number" ? data : 0;
  });

  return NextResponse.json({ ok: counts.failed === 0, ...counts });
}
