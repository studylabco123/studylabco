import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { businessInbox, siteUrl } from "@/lib/email/config";
import {
  bankDetails,
  buildLines,
  loadBookings,
  loadPeople,
} from "@/lib/email/notifications";
import { blocksNeedingPaymentReminder, dueReminders, expiredBlockHolds, type BlockHoldRow } from "@/lib/email/reminders";
import { sendEmail } from "@/lib/email/send";
import { formatPence } from "@/lib/format";
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

interface BlockRow extends BlockHoldRow {
  parentId: string | null;
  reference: string;
  pricePence: number;
  weeks: number;
}

/**
 * Vercel Cron (07:00 daily). Sends due reminders and block-payment checks
 * (all idempotent through email_log), then makes sure group sessions exist 12
 * weeks ahead. Doing a database round trip also keeps the Supabase project awake.
 */
export async function GET(request: Request): Promise<Response> {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const now = new Date();
  const c = createServiceClient();
  const counts = {
    freeCancelReminders: 0,
    lessonReminders: 0,
    blockPaymentReminders: 0,
    expiredBlockNotices: 0,
    skipped: 0,
    failed: 0,
    groupSessionsCreated: 0,
  };
  const tally = (r: "sent" | "skipped", key: "freeCancelReminders" | "lessonReminders" | "blockPaymentReminders" | "expiredBlockNotices") => {
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

  // Reminders: confirmed bookings starting in the next 96 hours.
  await guard("reminders", async () => {
    const { data, error } = await c
      .from("bookings")
      .select("id")
      .eq("status", "confirmed")
      .gt("starts_at", now.toISOString())
      .lte("starts_at", new Date(now.getTime() + 96 * 3600_000).toISOString());
    if (error) throw new Error(error.message);
    const bookings = await loadBookings(c, (data as { id: string }[]).map((r) => r.id));
    const due = dueReminders(bookings, now);
    if (due.length === 0) return;
    const byId = new Map(bookings.map((b) => [b.id, b]));
    const lines = await buildLines(c, bookings);
    const people = await loadPeople(c, bookings.map((b) => b.parentId));
    const priv = await bankDetails();
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

  // Block holds: remind the parent at 48 h, tell the business once a hold has run out.
  await guard("block holds", async () => {
    const { data, error } = await c
      .from("block_bookings")
      .select("id, status, created_at, hold_expires_at, parent_id, payment_reference, price_pence, weeks")
      .eq("status", "held");
    if (error) throw new Error(error.message);
    const blocks: BlockRow[] = (
      data as {
        id: string;
        status: string;
        created_at: string;
        hold_expires_at: string | null;
        parent_id: string | null;
        payment_reference: string;
        price_pence: number;
        weeks: number;
      }[]
    ).map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: new Date(r.created_at),
      holdExpiresAt: r.hold_expires_at ? new Date(r.hold_expires_at) : null,
      parentId: r.parent_id,
      reference: r.payment_reference,
      pricePence: r.price_pence,
      weeks: r.weeks,
    }));
    const remind = blocksNeedingPaymentReminder(blocks, now);
    const expired = expiredBlockHolds(blocks, now);
    if (remind.length === 0 && expired.length === 0) return;
    const people = await loadPeople(c, [...remind, ...expired].map((b) => b.parentId));
    const priv = await bankDetails();

    for (const b of remind) {
      await guard(`block reminder ${b.id}`, async () => {
        const parent = b.parentId ? people.get(b.parentId) : undefined;
        if (!parent) return;
        tally(
          await sendEmail({
            to: parent.email,
            template: "block_payment_reminder",
            blockBookingId: b.id,
            props: {
              parentName: parent.name,
              reference: b.reference,
              totalPence: b.pricePence,
              weeks: b.weeks,
              holdExpiresAt: b.holdExpiresAt,
              bank: priv.bank,
            },
          }),
          "blockPaymentReminders",
        );
      });
    }
    for (const b of expired) {
      await guard(`block expiry ${b.id}`, async () => {
        const parent = b.parentId ? people.get(b.parentId) : undefined;
        tally(
          await sendEmail({
            to: businessInbox(),
            template: "admin_block_hold_expired",
            blockBookingId: b.id,
            props: {
              title: "Block hold expired",
              lines: [
                `The hold on ${b.reference} (${b.weeks}-week block, ${formatPence(b.pricePence)}) for ${parent ? `${parent.name} (${parent.email})` : "a parent"} has expired and it is still unpaid.`,
                "The places are still reserved until you release the block.",
              ],
              link: { href: `${siteUrl()}/admin`, label: "Open the admin area" },
            },
          }),
          "expiredBlockNotices",
        );
      });
    }
  });

  await guard("group sessions", async () => {
    const until = addDays(londonDateOf(now), 84);
    const { data, error } = await c.rpc("ensure_group_sessions", { p_until: until });
    if (error) throw new Error(error.message);
    counts.groupSessionsCreated = typeof data === "number" ? data : 0;
  });

  return NextResponse.json({ ok: counts.failed === 0, ...counts });
}
