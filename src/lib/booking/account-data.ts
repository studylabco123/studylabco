import "server-only";
import { getSettings } from "@/lib/settings";
import { mapBooking, type BookingRow } from "@/lib/supabase/mappers";
import { createServiceClient } from "@/lib/supabase/service";
import type { Booking, Settings } from "@/lib/types";
import { cancellationDecision, cancellationOutcome } from "./cancellation";
import { lateFeePence } from "./fees";
import { amountOwedPence, creditBalancePence } from "./owed";
import { seatDuePence } from "./payment-view";

export interface BookingView {
  booking: Booking;
  title: string;
  childName: string | null;
  /** "Sunday bundle" or "Week 3 of 6"; null for standalone bookings. */
  membership: string | null;
  /** The reference to pay with: the block's own reference for a week of a block, else the booking's. */
  reference: string;
  /** What this booking would owe if unpaid (price plus travel, or the late/no-show fee). */
  duePence: number;
  /** Whether the parent may cancel it now. */
  cancellable: boolean;
  /** Fee due if cancelled now (the late cancellation fee, no travel); null when it would be free. */
  lateFeePence: number | null;
  /** Cancelling now is free only because the booking is in its 14-day cooling-off. */
  coolingOff: boolean;
}

export interface ChildOverview {
  id: string;
  name: string;
  hasAgreement: boolean;
  approved: boolean;
}

export interface OwedLine {
  reference: string;
  title: string;
  startsAt: Date;
  amountPence: number;
}

export interface AccountOverview {
  isBlocked: boolean;
  upcoming: BookingView[];
  past: BookingView[];
  owedPence: number;
  owedLines: OwedLine[];
  /** Credit the tutor can apply to a future lesson (Ruling R23). */
  creditPence: number;
  children: ChildOverview[];
}

const KIND_TITLE = { assessment: "Assessment Lesson", one_to_one: "1-to-1 lesson", group: "Group session" } as const;

/**
 * Everything the parent dashboard shows, read with the service client for the
 * signed-in parent's id. profiles.blocked_reason is never selected.
 */
export async function loadAccountOverview(parentId: string, now: Date = new Date()): Promise<AccountOverview> {
  const c = createServiceClient();
  const [profile, bookings, children, settings, credit] = await Promise.all([
    c.from("profiles").select("is_blocked").eq("id", parentId).single(),
    c.from("bookings").select("*").eq("parent_id", parentId).order("starts_at"),
    c.from("children").select("id, first_name, last_name, agreements(id), student_status(approved_at)").eq("parent_id", parentId).order("created_at"),
    getSettings(),
    c.from("ledger").select("kind, amount_pence").eq("parent_id", parentId).in("kind", ["credit", "credit_applied"]),
  ]);
  for (const r of [profile, bookings, children, credit]) if (r.error) throw new Error(`Could not load account: ${r.error.message}`);

  const all = (bookings.data as BookingRow[]).map(mapBooking);
  const names = new Map<string, string>();
  const childList: ChildOverview[] = (children.data ?? []).map((ch) => {
    const row = ch as unknown as {
      id: string;
      first_name: string;
      last_name: string;
      agreements: { id: string }[] | { id: string } | null;
      student_status: { approved_at: string | null }[] | { approved_at: string | null } | null;
    };
    const first = <T,>(v: T[] | T | null): T | undefined => (Array.isArray(v) ? v[0] : (v ?? undefined));
    names.set(row.id, `${row.first_name} ${row.last_name}`);
    return {
      id: row.id,
      name: `${row.first_name} ${row.last_name}`,
      hasAgreement: Boolean(first(row.agreements)),
      approved: Boolean(first(row.student_status)?.approved_at),
    };
  });

  const sessionIds = [...new Set(all.map((b) => b.groupSessionId).filter((x): x is string => x !== null))];
  const blockIds = [...new Set(all.map((b) => b.blockBookingId).filter((x): x is string => x !== null))];
  const [sessions, blocks] = await Promise.all([
    sessionIds.length ? c.from("group_sessions").select("id, title").in("id", sessionIds) : null,
    blockIds.length ? c.from("block_bookings").select("id, weeks, created_at, payment_reference, status").in("id", blockIds) : null,
  ]);
  const titles = new Map((sessions?.data ?? []).map((s) => [s.id as string, s.title as string]));
  const weeks = new Map((blocks?.data ?? []).map((b) => [b.id as string, b.weeks as number]));
  // A week of a block is paid with the block's reference, unless the block was released: then any
  // lesson already taught from it is paid on its own (Ruling R16), with its own reference.
  const blockRef = new Map(
    (blocks?.data ?? []).filter((b) => b.status !== "released").map((b) => [b.id as string, b.payment_reference as string]),
  );
  const referenceOf = (b: Booking) => (b.blockBookingId && blockRef.get(b.blockBookingId)) || b.paymentReference;
  // When each booking was made, for the 14-day cooling-off: a block week counts from the block.
  const blockMade = new Map((blocks?.data ?? []).map((b) => [b.id as string, new Date(b.created_at as string)]));
  const bookedAt = (b: Booking) => (b.blockBookingId && blockMade.get(b.blockBookingId)) || b.createdAt;

  const view = (b: Booking): BookingView => {
    let membership: string | null = null;
    if (b.blockBookingId) {
      const seats = all.filter((x) => x.blockBookingId === b.blockBookingId);
      membership = `Week ${seats.indexOf(b) + 1} of ${weeks.get(b.blockBookingId) ?? seats.length}`;
    } else if (b.bundleId) {
      membership = "Sunday bundle";
    }
    const cancellable = isCancellable(b, now);
    return {
      booking: b,
      title: (b.groupSessionId && titles.get(b.groupSessionId)) || KIND_TITLE[b.kind],
      childName: b.childId ? (names.get(b.childId) ?? null) : null,
      membership,
      reference: referenceOf(b),
      duePence: seatDuePence(b, settings.lateFeePercent),
      cancellable,
      lateFeePence: cancellable ? lateFee(b, now, settings, bookedAt(b)) : null,
      coolingOff: cancellable && freeBecauseCoolingOff(b, now, settings, bookedAt(b)),
    };
  };

  const upcoming = all.filter((b) => b.startsAt > now && (b.status === "pending" || b.status === "confirmed"));
  const upcomingIds = new Set(upcoming.map((b) => b.id));
  const past = all.filter((b) => !upcomingIds.has(b.id)).reverse();

  const owedLines: OwedLine[] = [];
  for (const b of all) {
    const amount = amountOwedPence([b], [], now, settings.lateFeePercent);
    if (amount > 0) {
      owedLines.push({ reference: referenceOf(b), title: view(b).title, startsAt: b.startsAt, amountPence: amount });
    }
  }

  return {
    isBlocked: profile.data!.is_blocked as boolean,
    upcoming: upcoming.map(view),
    past: past.map(view),
    owedPence: amountOwedPence(all, [], now, settings.lateFeePercent),
    owedLines,
    creditPence: creditBalancePence(
      (credit.data as { kind: "credit" | "credit_applied"; amount_pence: number }[]).map((r) => ({
        kind: r.kind,
        amountPence: r.amount_pence,
        parentId,
      })),
      parentId,
    ),
    children: childList,
  };
}

function isCancellable(b: Booking, now: Date): boolean {
  return (b.status === "pending" || b.status === "confirmed") && b.startsAt > now;
}

/** The fee a parent would owe cancelling now, or null if free. A pending home visit is always free. */
function lateFee(b: Booking, now: Date, settings: Settings, bookedAt: Date): number | null {
  if (b.status === "pending" && b.location === "home_visit") return null;
  return cancellationOutcome(b.startsAt, now, settings.cancellationNoticeHours, "parent", bookedAt) === "late"
    ? (b.feePence ?? lateFeePence(b.pricePence, settings.lateFeePercent))
    : null;
}

/** Free only because of the 14-day cooling-off (it would be late otherwise). */
function freeBecauseCoolingOff(b: Booking, now: Date, settings: Settings, bookedAt: Date): boolean {
  if (b.status === "pending" && b.location === "home_visit") return false;
  return cancellationDecision(b.startsAt, now, settings.cancellationNoticeHours, "parent", bookedAt).reason === "cooling_off";
}
