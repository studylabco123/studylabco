import "server-only";
import { getPrivateSettings, getSettings } from "@/lib/settings";
import { createServiceClient } from "@/lib/supabase/service";
import { mapBooking, type BookingRow } from "@/lib/supabase/mappers";
import { formatPence } from "@/lib/format";
import type { Booking } from "@/lib/types";
import { lateFeeFor } from "@/lib/booking/fees";
import { businessInbox, siteUrl } from "./config";
import { whenText } from "./templates/parts";
import { sendEmail } from "./send";
import type { BankDetails, SessionLine } from "./types";

export interface Person {
  id: string;
  name: string;
  email: string;
}

type Client = ReturnType<typeof createServiceClient>;

function fail(what: string, error: { message: string }): never {
  throw new Error(`${what}: ${error.message}`);
}

export async function loadBookings(c: Client, ids: string[]): Promise<Booking[]> {
  if (ids.length === 0) return [];
  const { data, error } = await c.from("bookings").select("*").in("id", ids).order("starts_at");
  if (error) fail("Could not load bookings", error);
  return (data as BookingRow[]).map(mapBooking);
}

export async function loadPeople(c: Client, ids: (string | null)[]): Promise<Map<string, Person>> {
  const unique = [...new Set(ids.filter((i): i is string => !!i))];
  const out = new Map<string, Person>();
  if (unique.length === 0) return out;
  const { data, error } = await c.from("profiles").select("id, full_name, email").in("id", unique);
  if (error) fail("Could not load profiles", error);
  for (const p of data as { id: string; full_name: string; email: string }[]) {
    out.set(p.id, { id: p.id, name: p.full_name?.trim() || "there", email: p.email });
  }
  return out;
}

/** One SessionLine per booking, keyed by booking id. */
export async function buildLines(c: Client, bookings: Booking[]): Promise<Map<string, SessionLine>> {
  const childIds = [...new Set(bookings.map((b) => b.childId).filter((i): i is string => !!i))];
  const sessionIds = [...new Set(bookings.map((b) => b.groupSessionId).filter((i): i is string => !!i))];
  const [children, sessions, settings] = await Promise.all([
    childIds.length ? c.from("children").select("id, first_name").in("id", childIds) : { data: [], error: null },
    sessionIds.length ? c.from("group_sessions").select("id, title, venue").in("id", sessionIds) : { data: [], error: null },
    getSettings(),
  ]);
  if (children.error) fail("Could not load children", children.error);
  if (sessions.error) fail("Could not load group sessions", sessions.error);
  const childName = new Map((children.data as { id: string; first_name: string }[]).map((x) => [x.id, x.first_name]));
  const session = new Map(
    (sessions.data as { id: string; title: string; venue: string | null }[]).map((x) => [x.id, x]),
  );

  const out = new Map<string, SessionLine>();
  for (const b of bookings) {
    const g = b.groupSessionId ? session.get(b.groupSessionId) : undefined;
    out.set(b.id, {
      reference: b.paymentReference,
      title: g?.title ?? (b.kind === "assessment" ? "Assessment Lesson" : b.kind === "group" ? "Group session" : "1-to-1 lesson"),
      childName: b.childId ? (childName.get(b.childId) ?? null) : null,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      location: b.location,
      status: b.status,
      pricePence: b.pricePence,
      lateFeePence: lateFeeFor(b, settings.lateFeePercent),
      lateFeePercent: settings.lateFeePercent,
      travelPence: b.travelFeePence,
      homeAddress: b.homeAddress,
      bookedAt: b.createdAt,
      venue: g ? (g.venue ?? settings.groupVenue) : null,
    });
  }
  return out;
}

export async function bankDetails(): Promise<{ bank: BankDetails | null; teachingAddress: string | null; meetingLink: string | null; noticeHours: number }> {
  const [p, s] = await Promise.all([getPrivateSettings(), getSettings()]);
  return {
    bank:
      p.bankAccountName && p.bankSortCode && p.bankAccountNumber
        ? { accountName: p.bankAccountName, sortCode: p.bankSortCode, accountNumber: p.bankAccountNumber }
        : null,
    teachingAddress: p.teachingAddress,
    meetingLink: p.meetingLink,
    noticeHours: s.cancellationNoticeHours,
  };
}

/** Runs an email action; a failure is logged, never thrown (emails must not break the user's action). */
export async function safely(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`email: ${label} failed`, err);
  }
}

const describe = (l: SessionLine) =>
  `${whenText(l.startsAt)}: ${l.title}${l.childName ? ` for ${l.childName}` : ""} (${l.reference}, ${formatPence(l.pricePence + l.travelPence)})`;

/**
 * The booking confirmation (one email for the whole request: a Sunday bundle
 * or block lists every session) to the parent, and a notice to the business.
 */
export async function notifyBookingCreated(bookingIds: string[]): Promise<void> {
  const c = createServiceClient();
  const bookings = await loadBookings(c, bookingIds);
  if (bookings.length === 0) return;
  const blockId = bookings[0].blockBookingId;
  const people = await loadPeople(c, [bookings[0].parentId]);
  const parent = bookings[0].parentId ? people.get(bookings[0].parentId) : undefined;
  const lines = await buildLines(c, bookings);
  const sessions = bookings.map((b) => lines.get(b.id)!);
  const totalPence = sessions.reduce((n, s) => n + s.pricePence + s.travelPence, 0);
  const priv = await bankDetails();

  let blockReference: string | null = null;
  if (blockId) {
    const { data } = await c.from("block_bookings").select("payment_reference").eq("id", blockId).maybeSingle();
    blockReference = (data as { payment_reference: string } | null)?.payment_reference ?? null;
  }
  // Idempotency key: the block, or else the first booking of the request.
  const key = blockId ? { blockBookingId: blockId } : { bookingId: bookingIds[0] };

  if (parent) {
    await safely("booking confirmation", () =>
      sendEmail({
        to: parent.email,
        template: "booking_confirmed",
        ...key,
        props: {
          parentName: parent.name,
          sessions,
          totalPence,
          bank: priv.bank,
          teachingAddress: priv.teachingAddress,
          meetingLink: priv.meetingLink,
          blockReference,
          noticeHours: priv.noticeHours,
        },
      }),
    );
  }

  const homeVisit = sessions.some((s) => s.status === "pending" && s.location === "home_visit");
  await safely("booking admin notice", () =>
    sendEmail({
      to: businessInbox(),
      template: homeVisit ? "admin_home_visit_request" : "admin_new_booking",
      ...key,
      props: {
        title: homeVisit ? "Home visit request — needs approval" : "New booking",
        lines: [
          `${parent?.name ?? "A parent"}${parent ? ` (${parent.email})` : ""} has booked ${sessions.length > 1 ? `${sessions.length} sessions` : "a session"}.`,
          ...sessions.map(describe),
          ...(homeVisit ? [`Address: ${sessions[0].homeAddress ?? "not given"}`] : []),
          `Total: ${formatPence(totalPence)}`,
        ],
        link: { href: `${siteUrl()}/admin`, label: "Open the admin area" },
      },
    }),
  );
}

/** Receipt to the parent after they cancel; a late cancellation also tells the business. */
export async function notifyBookingCancelled(
  bookingId: string,
  outcome: "free" | "late",
  opts: { byAdmin?: boolean } = {},
): Promise<void> {
  const c = createServiceClient();
  const [booking] = await loadBookings(c, [bookingId]);
  if (!booking) return;
  const people = await loadPeople(c, [booking.parentId]);
  const parent = booking.parentId ? people.get(booking.parentId) : undefined;
  const session = (await buildLines(c, [booking])).get(booking.id)!;

  if (parent) {
    await safely("cancellation receipt", () =>
      sendEmail({
        to: parent.email,
        template: "cancellation_receipt",
        bookingId,
        props: {
          parentName: parent.name,
          session,
          outcome,
          // A free cancel credits a paid booking; a late one keeps it 'paid' and credits what is left after the fee.
          wasPaid: outcome === "late" ? booking.paymentStatus === "paid" : booking.paymentStatus === "credited",
          creditPence:
            outcome === "late" && booking.paymentStatus === "paid"
              ? Math.max(0, booking.pricePence + booking.travelFeePence - session.lateFeePence)
              : undefined,
        },
      }),
    );
  }
  if (outcome === "late" && !opts.byAdmin) {
    await safely("late cancellation notice", () =>
      sendEmail({
        to: businessInbox(),
        template: "admin_late_cancellation",
        bookingId,
        props: {
          title: "Late cancellation",
          lines: [
            `${parent?.name ?? "A parent"}${parent ? ` (${parent.email})` : ""} cancelled inside the notice period.`,
            describe(session),
            `Late cancellation fee: ${formatPence(session.lateFeePence)}`,
          ],
          link: { href: `${siteUrl()}/admin`, label: "Open the admin area" },
        },
      }),
    );
  }
}

/** Tells the business about a new account. */
export async function notifyNewSignup(p: { name: string; email: string; phone: string }): Promise<void> {
  await safely("sign-up notice", () =>
    sendEmail({
      to: businessInbox(),
      template: "admin_new_signup",
      props: { title: "New sign-up", lines: [`${p.name} (${p.email}, ${p.phone}) has created an account.`] },
    }),
  );
}
