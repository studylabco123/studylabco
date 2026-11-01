import "server-only";
import { childLevelLine } from "@/lib/children/summary";
import { getPrivateSettings, getSettings } from "@/lib/settings";
import { mapBooking, mapPass, type BookingRow, type PassRow } from "@/lib/supabase/mappers";
import { createServiceClient } from "@/lib/supabase/service";
import type { Booking, Level, Pass, Settings } from "@/lib/types";
import { cancellationDecision, parentCanCancelOnline } from "./cancellation";
import { amountOwedPence, creditBalancePence } from "./owed";
import { passCardText, passInCoolingOff, passRemaining, passUsable } from "./pass";
import { seatDuePence } from "./payment-view";

export interface BookingView {
  booking: Booking;
  title: string;
  childName: string | null;
  /** "Group pass", "Sunday bundle" or both; null for standalone bookings. */
  membership: string | null;
  /** The reference to pay with. */
  reference: string;
  /** What this booking would owe if unpaid (price plus travel, or the late/no-show fee). */
  duePence: number;
  /** The parent may cancel it on the website now (the lesson is at least the notice period away). */
  cancellable: boolean;
  /** Inside the notice period: the parent must call or email; no cancel button. */
  callRequired: boolean;
  /** When `callRequired`: cancelling would be free (14-day cooling-off). */
  callFree: boolean;
}

export interface ChildOverview {
  id: string;
  name: string;
  /** "Year 8, KS3" or "Year 11, GCSE, AQA Higher". */
  levelLine: string;
  hasAgreement: boolean;
  approved: boolean;
}

export interface OwedLine {
  reference: string;
  title: string;
  startsAt: Date;
  amountPence: number;
}

export interface PassView {
  pass: Pass;
  childName: string | null;
  remaining: number;
  /** "KS3 group pass — 4 of 6 sessions left — expires 1 May 2027". */
  text: string;
  /** Paid, not expired, with a session left: "Book a session" is offered. */
  bookable: boolean;
  /** Within 14 days of buying: the parent can cancel it on the website. */
  cancellable: boolean;
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
  /** The late cancellation fee as a percentage of the lesson price (Settings). */
  lateFeePercent: number;
  /** The notice period in hours (Settings). */
  noticeHours: number;
  /** The business phone (Settings), shown when set. */
  businessPhone: string | null;
  /** Group passes that are awaiting payment, active, or expired with sessions still booked; newest first. */
  passes: PassView[];
  /** Bank details for paying a pass, when one is awaiting payment and they are set. */
  bank: { accountName: string; sortCode: string; accountNumber: string } | null;
  /** How long a pass lasts once paid, and how far ahead its sessions are booked (Settings). */
  passValidityMonths: number;
  passMinNoticeDays: number;
}

const KIND_TITLE = { assessment: "Assessment Lesson", one_to_one: "1-to-1 lesson", group: "Group session" } as const;

/**
 * Everything the parent dashboard shows, read with the service client for the
 * signed-in parent's id. profiles.blocked_reason is never selected.
 */
export async function loadAccountOverview(parentId: string, now: Date = new Date()): Promise<AccountOverview> {
  const c = createServiceClient();
  const [profile, bookings, children, settings, credit, passRows] = await Promise.all([
    c.from("profiles").select("is_blocked").eq("id", parentId).single(),
    c.from("bookings").select("*").eq("parent_id", parentId).order("starts_at"),
    c.from("children").select("id, first_name, last_name, school_year, level, exam_board, tier, agreements(id), student_status(approved_at)").eq("parent_id", parentId).order("created_at"),
    getSettings(),
    c.from("ledger").select("kind, amount_pence").eq("parent_id", parentId).in("kind", ["credit", "credit_applied"]),
    c.from("passes").select("*").eq("parent_id", parentId).neq("status", "cancelled").order("created_at", { ascending: false }),
  ]);
  for (const r of [profile, bookings, children, credit, passRows]) if (r.error) throw new Error(`Could not load account: ${r.error.message}`);

  const all = (bookings.data as BookingRow[]).map(mapBooking);
  const names = new Map<string, string>();
  const childList: ChildOverview[] = (children.data ?? []).map((ch) => {
    const row = ch as unknown as {
      id: string;
      first_name: string;
      last_name: string;
      school_year: number;
      level: Level;
      exam_board: string | null;
      tier: string | null;
      agreements: { id: string }[] | { id: string } | null;
      student_status: { approved_at: string | null }[] | { approved_at: string | null } | null;
    };
    const first = <T,>(v: T[] | T | null): T | undefined => (Array.isArray(v) ? v[0] : (v ?? undefined));
    names.set(row.id, `${row.first_name} ${row.last_name}`);
    return {
      id: row.id,
      name: `${row.first_name} ${row.last_name}`,
      levelLine: childLevelLine({ schoolYear: row.school_year, level: row.level, examBoard: row.exam_board, tier: row.tier }),
      hasAgreement: Boolean(first(row.agreements)),
      approved: Boolean(first(row.student_status)?.approved_at),
    };
  });

  const sessionIds = [...new Set(all.map((b) => b.groupSessionId).filter((x): x is string => x !== null))];
  const sessions = sessionIds.length ? await c.from("group_sessions").select("id, title").in("id", sessionIds) : null;
  const titles = new Map((sessions?.data ?? []).map((s) => [s.id as string, s.title as string]));
  const referenceOf = (b: Booking) => b.paymentReference;

  const passes = (passRows.data as PassRow[]).map(mapPass);
  // A pass seat's 14-day cooling-off counts from when the pass was bought.
  const passBought = new Map(passes.map((p) => [p.id, p.createdAt]));
  const bookedAt = (b: Booking) => (b.passId && passBought.get(b.passId)) || b.createdAt;

  const view = (b: Booking): BookingView => {
    const membership = b.passId ? (b.bundleId ? "Group pass · Sunday bundle" : "Group pass") : b.bundleId ? "Sunday bundle" : null;
    const live = isCancellable(b, now);
    const neverConfirmed = b.status === "pending" && b.location === "home_visit";
    const cancellable = live && (neverConfirmed || parentCanCancelOnline(b.startsAt, now, settings.cancellationNoticeHours));
    return {
      booking: b,
      title: (b.groupSessionId && titles.get(b.groupSessionId)) || KIND_TITLE[b.kind],
      childName: b.childId ? (names.get(b.childId) ?? null) : null,
      membership,
      reference: referenceOf(b),
      // A pass seat costs nothing more unless a late cancellation / no-show fee is owed.
      duePence: b.passId && b.status !== "late_cancelled" && b.status !== "no_show" ? 0 : seatDuePence(b, settings.lateFeePercent),
      cancellable,
      callRequired: live && !cancellable,
      callFree: live && !cancellable && freeInsideNotice(b, now, settings, bookedAt(b)),
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

  const passViews: PassView[] = passes
    .map((p) => {
      const remaining = passRemaining(p, all);
      return {
        pass: p,
        childName: p.childId ? (names.get(p.childId) ?? null) : null,
        remaining,
        text: passCardText(p, remaining),
        bookable: passUsable(p, now) && remaining > 0,
        cancellable: (p.status === "awaiting_payment" || p.status === "active") && passInCoolingOff(p, now),
      };
    })
    // An expired pass stays on show only while it still has sessions booked ahead.
    .filter((v) => v.pass.status !== "expired" || all.some((b) => b.passId === v.pass.id && isCancellable(b, now)));
  const priv = passViews.some((v) => v.pass.status === "awaiting_payment") ? await getPrivateSettings() : null;
  const bank =
    priv?.bankAccountName && priv.bankSortCode && priv.bankAccountNumber
      ? { accountName: priv.bankAccountName, sortCode: priv.bankSortCode, accountNumber: priv.bankAccountNumber }
      : null;

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
    lateFeePercent: settings.lateFeePercent,
    noticeHours: settings.cancellationNoticeHours,
    businessPhone: settings.businessPhone?.trim() || null,
    passes: passViews,
    bank,
    passValidityMonths: settings.passValidityMonths,
    passMinNoticeDays: settings.passMinNoticeDays,
  };
}

function isCancellable(b: Booking, now: Date): boolean {
  return (b.status === "pending" || b.status === "confirmed") && b.startsAt > now;
}

/** Inside the notice period, cancelling by phone or email is still free within the 14-day cooling-off. */
function freeInsideNotice(b: Booking, now: Date, settings: Settings, bookedAt: Date): boolean {
  return cancellationDecision(b.startsAt, now, settings.cancellationNoticeHours, "parent", bookedAt).reason === "cooling_off";
}
