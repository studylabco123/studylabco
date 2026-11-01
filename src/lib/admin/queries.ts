import "server-only";
import { amountOwedPence, creditBalancePence, isFlagged } from "@/lib/booking/owed";
import { blockDuePence } from "@/lib/booking/payment-view";
import { getSettings } from "@/lib/settings";
import { mapBooking, type BookingRow } from "@/lib/supabase/mappers";
import { createServiceClient } from "@/lib/supabase/service";
import { addDays, londonDateOf, londonDateTime } from "@/lib/time";
import type { Booking, LedgerEntry, Settings } from "@/lib/types";

/** Read side of the admin Today, Bookings and Families pages (service client; callers must have passed requireAdmin()). */

const db = () => createServiceClient();
const DAY = 86_400_000;
const ACTIVE = ["pending", "confirmed", "attended"] as const;

function check<T>(what: string, r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(`Could not load ${what}: ${r.error.message}`);
  return (r.data ?? []) as T;
}

const toBookings = (rows: unknown) => (rows as BookingRow[]).map(mapBooking);

interface ProfileLite {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  is_blocked: boolean;
}
interface ChildLite {
  id: string;
  parent_id: string;
  first_name: string;
  last_name: string;
}

async function profilesById(ids: (string | null)[]): Promise<Map<string, ProfileLite>> {
  const unique = [...new Set(ids.filter((i): i is string => !!i))];
  if (!unique.length) return new Map();
  const rows = check<ProfileLite[]>("profiles", await db().from("profiles").select("id, full_name, email, phone, is_blocked").in("id", unique));
  return new Map(rows.map((p) => [p.id, p]));
}

async function childrenById(ids: (string | null)[]): Promise<Map<string, ChildLite>> {
  const unique = [...new Set(ids.filter((i): i is string => !!i))];
  if (!unique.length) return new Map();
  const rows = check<ChildLite[]>("children", await db().from("children").select("id, parent_id, first_name, last_name").in("id", unique));
  return new Map(rows.map((c) => [c.id, c]));
}

export const parentName = (p: ProfileLite | undefined) => p?.full_name?.trim() || p?.email || "Unknown parent";
const childName = (c: ChildLite | undefined) => (c ? `${c.first_name} ${c.last_name}` : "Unknown child");

// ---------------------------------------------------------------------------
// Today
// ---------------------------------------------------------------------------

export interface TodayLesson {
  booking: Booking;
  childName: string;
  parentId: string | null;
}

export interface AlertLink {
  key: string;
  label: string;
  detail: string;
  href: string;
}

export interface TodayData {
  date: string;
  lessons: TodayLesson[];
  alerts: { key: string; title: string; items: AlertLink[] }[];
}

export async function loadToday(now: Date = new Date()): Promise<TodayData> {
  const c = db();
  const date = londonDateOf(now);
  const dayStart = londonDateTime(date, "00:00");
  const dayEnd = londonDateTime(addDays(date, 1), "00:00");
  const settings = await getSettings();

  const [todayRows, pendingRows, unpaidRows, holdRows, kids, assessments, badRows] = await Promise.all([
    c.from("bookings").select("*").gte("starts_at", dayStart.toISOString()).lt("starts_at", dayEnd.toISOString()).not("status", "in", "(cancelled,declined)").order("starts_at"),
    c.from("bookings").select("*").eq("status", "pending").eq("location", "home_visit").order("starts_at"),
    c.from("bookings").select("*").eq("payment_status", "unpaid").in("status", ["late_cancelled", "no_show", "attended", "confirmed"]).lte("starts_at", now.toISOString()).order("starts_at"),
    c.from("block_bookings").select("id, parent_id, child_id, payment_reference, hold_expires_at, status").eq("status", "held").lt("hold_expires_at", now.toISOString()),
    c.from("children").select("id, parent_id, first_name, last_name, agreements(id), student_status(approved_at)"),
    c.from("bookings").select("child_id, status").eq("kind", "assessment").in("status", [...ACTIVE]),
    c.from("bookings").select("*").in("status", ["late_cancelled", "no_show"]).gte("starts_at", new Date(now.getTime() - 365 * DAY).toISOString()),
  ]);

  const today = toBookings(check("today's bookings", todayRows));
  const pending = toBookings(check("pending home visits", pendingRows));
  const unpaid = toBookings(check("unpaid lessons", unpaidRows)).filter((b) => amountOwedPence([b], [], now) > 0);
  const holds = check<{ id: string; parent_id: string | null; child_id: string | null; payment_reference: string }[]>("block holds", holdRows);
  const children = check<(ChildLite & { agreements: unknown; student_status: unknown })[]>("children", kids);
  const assessmentBookings = check<{ child_id: string | null; status: string }[]>("assessments", assessments);
  const bad = toBookings(check("late cancellations", badRows));

  const hasRow = (v: unknown) => (Array.isArray(v) ? v.length > 0 : Boolean(v));
  const approvedOf = (v: unknown): boolean => {
    const row = Array.isArray(v) ? v[0] : v;
    return Boolean((row as { approved_at?: string | null } | null | undefined)?.approved_at);
  };
  const attendedChildren = new Set(assessmentBookings.filter((a) => a.status === "attended").map((a) => a.child_id));
  const assessmentChildren = new Set(assessmentBookings.map((a) => a.child_id));
  const noAssessment = children.filter((ch) => hasRow(ch.agreements) && !approvedOf(ch.student_status) && !assessmentChildren.has(ch.id));
  const awaitingApproval = children.filter((ch) => attendedChildren.has(ch.id) && !approvedOf(ch.student_status));

  const byParent = new Map<string, Booking[]>();
  for (const b of bad) if (b.parentId) byParent.set(b.parentId, [...(byParent.get(b.parentId) ?? []), b]);
  const flaggedIds = [...byParent.entries()].filter(([, bs]) => isFlagged(bs, now, settings.flagThreshold)).map(([id]) => id);

  const unpaidByParent = new Map<string, Booking[]>();
  for (const b of unpaid) if (b.parentId) unpaidByParent.set(b.parentId, [...(unpaidByParent.get(b.parentId) ?? []), b]);

  const profiles = await profilesById([
    ...today.map((b) => b.parentId),
    ...pending.map((b) => b.parentId),
    ...unpaidByParent.keys(),
    ...holds.map((h) => h.parent_id),
    ...children.map((ch) => ch.parent_id),
    ...flaggedIds,
  ]);
  const kidMap = await childrenById([...today.map((b) => b.childId), ...pending.map((b) => b.childId), ...holds.map((h) => h.child_id)]);

  const alerts: TodayData["alerts"] = [];
  const add = (key: string, title: string, items: AlertLink[]) => items.length && alerts.push({ key, title, items });
  add(
    "home-visits",
    "Home visits waiting for your decision",
    pending.map((b) => ({
      key: b.id,
      label: `${childName(kidMap.get(b.childId ?? ""))} (${parentName(profiles.get(b.parentId ?? ""))})`,
      detail: b.startsAt.toISOString(),
      href: `/admin/bookings?filter=all&q=${encodeURIComponent(b.paymentReference)}`,
    })),
  );
  add(
    "unpaid",
    "Unpaid past lessons",
    [...unpaidByParent.entries()].map(([pid, bs]) => ({
      key: pid,
      label: parentName(profiles.get(pid)),
      detail: `${amountOwedPence(bs, [], now)}|${bs.length}`,
      href: `/admin/families/${pid}`,
    })),
  );
  add(
    "holds",
    "Block holds that have run out",
    holds.map((h) => ({
      key: h.id,
      label: `${parentName(profiles.get(h.parent_id ?? ""))} (${h.payment_reference})`,
      detail: "",
      href: "/admin/bookings#blocks",
    })),
  );
  add(
    "no-assessment",
    "Agreement signed, no Assessment Lesson booked",
    noAssessment.map((ch) => ({
      key: ch.id,
      label: `${ch.first_name} ${ch.last_name} (${parentName(profiles.get(ch.parent_id))})`,
      detail: "",
      href: `/admin/families/${ch.parent_id}`,
    })),
  );
  add(
    "approval",
    "Assessment attended, waiting for your approval",
    awaitingApproval.map((ch) => ({
      key: ch.id,
      label: `${ch.first_name} ${ch.last_name} (${parentName(profiles.get(ch.parent_id))})`,
      detail: "",
      href: `/admin/families/${ch.parent_id}`,
    })),
  );
  add(
    "flagged",
    "Parents with repeated late cancellations or no-shows",
    flaggedIds.map((pid) => ({
      key: pid,
      label: parentName(profiles.get(pid)),
      detail: String(byParent.get(pid)!.length),
      href: `/admin/families/${pid}`,
    })),
  );

  return {
    date,
    lessons: today.map((b) => ({ booking: b, childName: childName(kidMap.get(b.childId ?? "")), parentId: b.parentId })),
    alerts,
  };
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

export const BOOKING_FILTERS = ["upcoming", "todo", "unpaid", "past", "all"] as const;
export type BookingFilter = (typeof BOOKING_FILTERS)[number];

export interface BookingItem {
  booking: Booking;
  childName: string;
  parentName: string;
  parentId: string | null;
  membership: string | null;
  owedPence: number;
  /** Row of a block that was released: paid one by one. */
  blockReleased: boolean;
}

export interface BlockItem {
  id: string;
  reference: string;
  parentId: string | null;
  parentName: string;
  childName: string;
  product: string;
  weeks: number;
  pricePence: number;
  holdExpiresAt: Date | null;
  expired: boolean;
}

/** Ids of parents and children whose name or email contains `q`, for the booking search. */
async function matchIds(q: string): Promise<{ parents: string[]; children: string[] }> {
  const pattern = `%${q.replace(/[%_\\,()]/g, " ").trim()}%`;
  const [p, ch] = await Promise.all([
    db().from("profiles").select("id").or(`full_name.ilike.${pattern},email.ilike.${pattern}`),
    db().from("children").select("id").or(`first_name.ilike.${pattern},last_name.ilike.${pattern}`),
  ]);
  return {
    parents: check<{ id: string }[]>("search", p).map((r) => r.id),
    children: check<{ id: string }[]>("search", ch).map((r) => r.id),
  };
}

export async function loadBookings(
  filter: BookingFilter,
  q: string,
  now: Date = new Date(),
): Promise<{ items: BookingItem[]; blocks: BlockItem[] }> {
  const c = db();
  let query = c.from("bookings").select("*");
  const term = q.trim();
  if (term) {
    const ref = /^SLC-\d+$/i.test(term);
    if (ref) {
      query = query.eq("payment_reference", term.toUpperCase());
    } else {
      const m = await matchIds(term);
      const parts = [
        m.parents.length ? `parent_id.in.(${m.parents.join(",")})` : "",
        m.children.length ? `child_id.in.(${m.children.join(",")})` : "",
      ].filter(Boolean);
      if (!parts.length) return { items: [], blocks: await loadHeldBlocks(now, term) };
      query = query.or(parts.join(","));
    }
  }
  const iso = now.toISOString();
  switch (filter) {
    case "upcoming":
      query = query.in("status", ["pending", "confirmed"]).gt("ends_at", iso).order("starts_at", { ascending: true });
      break;
    case "todo":
      query = query.or(`and(status.eq.pending,location.eq.home_visit),and(status.eq.confirmed,starts_at.lte.${iso}),and(payment_status.eq.unpaid,starts_at.lte.${iso},status.in.(late_cancelled,no_show,attended))`).order("starts_at", { ascending: true });
      break;
    case "unpaid":
      query = query.eq("payment_status", "unpaid").in("status", ["late_cancelled", "no_show", "attended", "confirmed"]).lte("starts_at", iso).order("starts_at", { ascending: true });
      break;
    case "past":
      query = query.lt("starts_at", iso).order("starts_at", { ascending: false });
      break;
    case "all":
      query = query.order("starts_at", { ascending: false });
      break;
  }
  const rows = toBookings(check("bookings", await query.limit(150)));
  const [profiles, kids] = await Promise.all([profilesById(rows.map((b) => b.parentId)), childrenById(rows.map((b) => b.childId))]);
  const released = await releasedBlockIds(rows);

  const items = rows
    .map<BookingItem>((b) => ({
      booking: b,
      childName: childName(kids.get(b.childId ?? "")),
      parentName: parentName(profiles.get(b.parentId ?? "")),
      parentId: b.parentId,
      membership: b.blockBookingId ? "Block" : b.bundleId ? "Sunday bundle" : null,
      owedPence: amountOwedPence([b], [], now),
      blockReleased: released.has(b.blockBookingId ?? ""),
    }))
    // The unpaid view is about money owed now, which excludes lessons paid for through a block.
    .filter((i) => (filter === "unpaid" ? i.owedPence > 0 : true));
  return { items, blocks: await loadHeldBlocks(now, term) };
}

async function releasedBlockIds(rows: Booking[]): Promise<Set<string>> {
  const ids = [...new Set(rows.map((b) => b.blockBookingId).filter((x): x is string => !!x))];
  if (!ids.length) return new Set();
  const res = check<{ id: string }[]>("blocks", await db().from("block_bookings").select("id").in("id", ids).eq("status", "released"));
  return new Set(res.map((r) => r.id));
}

async function loadHeldBlocks(now: Date, q: string): Promise<BlockItem[]> {
  const rows = check<
    { id: string; parent_id: string | null; child_id: string | null; product: string; weeks: number; price_pence: number; payment_reference: string; hold_expires_at: string | null }[]
  >("blocks", await db().from("block_bookings").select("id, parent_id, child_id, product, weeks, price_pence, payment_reference, hold_expires_at").eq("status", "held").order("created_at"));
  const [profiles, kids, seatRes] = await Promise.all([
    profilesById(rows.map((r) => r.parent_id)),
    childrenById(rows.map((r) => r.child_id)),
    rows.length
      ? db().from("bookings").select("block_booking_id, status, price_pence").in("block_booking_id", rows.map((r) => r.id))
      : Promise.resolve({ data: [], error: null }),
  ]);
  const seats = check<{ block_booking_id: string; status: Booking["status"]; price_pence: number }[]>("block sessions", seatRes);
  const items = rows.map<BlockItem>((r) => ({
    id: r.id,
    reference: r.payment_reference,
    parentId: r.parent_id,
    parentName: parentName(profiles.get(r.parent_id ?? "")),
    childName: childName(kids.get(r.child_id ?? "")),
    product: r.product,
    weeks: r.weeks,
    // The amount due: the block price less weeks cancelled for free (review I3).
    pricePence: blockDuePence(
      r.price_pence,
      seats.filter((x) => x.block_booking_id === r.id).map((x) => ({ status: x.status, pricePence: x.price_pence })),
    ),
    holdExpiresAt: r.hold_expires_at ? new Date(r.hold_expires_at) : null,
    expired: r.hold_expires_at ? new Date(r.hold_expires_at).getTime() < now.getTime() : false,
  }));
  const needle = q.toLowerCase();
  return needle
    ? items.filter((i) => [i.parentName, i.childName, i.reference].some((s) => s.toLowerCase().includes(needle)))
    : items;
}

// ---------------------------------------------------------------------------
// Families
// ---------------------------------------------------------------------------

export interface FamilyListItem {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  childNames: string[];
  owedPence: number;
  flagged: boolean;
  blocked: boolean;
}

export async function loadFamilies(q: string, now: Date = new Date()): Promise<FamilyListItem[]> {
  const c = db();
  const settings = await getSettings();
  let pq = c.from("profiles").select("id, full_name, email, phone, is_blocked").eq("role", "parent").order("full_name");
  const term = q.trim().replace(/[%_\\,()]/g, " ").trim();
  if (term) pq = pq.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
  let profiles = check<ProfileLite[]>("families", await pq.limit(200));

  if (term) {
    // Also match a child's name.
    const kids = check<{ parent_id: string }[]>("children", await c.from("children").select("parent_id").or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`));
    const extra = [...new Set(kids.map((k) => k.parent_id))].filter((id) => !profiles.some((p) => p.id === id));
    if (extra.length) {
      const more = check<ProfileLite[]>("families", await c.from("profiles").select("id, full_name, email, phone, is_blocked").eq("role", "parent").in("id", extra));
      profiles = [...profiles, ...more];
    }
  }
  const ids = profiles.map((p) => p.id);
  if (!ids.length) return [];
  const [kids, owing, bad] = await Promise.all([
    c.from("children").select("parent_id, first_name").in("parent_id", ids).order("created_at"),
    c.from("bookings").select("*").in("parent_id", ids).eq("payment_status", "unpaid"),
    c.from("bookings").select("*").in("parent_id", ids).in("status", ["late_cancelled", "no_show"]).gte("starts_at", new Date(now.getTime() - 365 * DAY).toISOString()),
  ]);
  const kidRows = check<{ parent_id: string; first_name: string }[]>("children", kids);
  const owingRows = toBookings(check("bookings", owing));
  const badRows = toBookings(check("bookings", bad));
  return profiles.map((p) => ({
    id: p.id,
    name: parentName(p),
    email: p.email,
    phone: p.phone,
    childNames: kidRows.filter((k) => k.parent_id === p.id).map((k) => k.first_name),
    owedPence: amountOwedPence(owingRows.filter((b) => b.parentId === p.id), [], now),
    flagged: isFlagged(badRows.filter((b) => b.parentId === p.id), now, settings.flagThreshold),
    blocked: p.is_blocked,
  }));
}

export interface FamilyChild {
  id: string;
  name: string;
  firstName: string;
  schoolYear: number;
  examBoard: string;
  tier: string;
  subjects: string[];
  targetGrade: string | null;
  agreement: {
    signedName: string;
    signedAt: Date;
    policyVersion: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
    medicalInfo: string | null;
    senInfo: string | null;
    consentContact: boolean;
  } | null;
  approvedAt: Date | null;
  assessmentCompletedAt: Date | null;
  assessmentAttended: boolean;
  notes: { id: string; createdAt: Date; body: string }[];
}

export interface FamilyDetail {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  createdAt: Date;
  isBlocked: boolean;
  blockedReason: string | null;
  children: FamilyChild[];
  history: BookingItem[];
  owedPence: number;
  /** Credit issued minus credit applied (Ruling R23). */
  creditPence: number;
  flagCount: number;
  flagged: boolean;
  settings: Settings;
}

export async function loadFamily(parentId: string, now: Date = new Date()): Promise<FamilyDetail | null> {
  const c = db();
  const prof = await c.from("profiles").select("id, created_at, full_name, email, phone, role, is_blocked, blocked_reason").eq("id", parentId).maybeSingle();
  if (prof.error) {
    if (prof.error.code === "22P02") return null; // not a uuid
    throw new Error(`Could not load family: ${prof.error.message}`);
  }
  const p = prof.data as (ProfileLite & { created_at: string; role: string; blocked_reason: string | null }) | null;
  if (!p || p.role !== "parent") return null;

  const [settings, kidsRes, bookingsRes, creditRes] = await Promise.all([
    getSettings(),
    c.from("children").select("*, agreements(*), student_status(*), tutor_notes(id, created_at, body)").eq("parent_id", parentId).order("created_at"),
    c.from("bookings").select("*").eq("parent_id", parentId).order("starts_at", { ascending: false }),
    c.from("ledger").select("kind, amount_pence, parent_id").eq("parent_id", parentId).in("kind", ["credit", "credit_applied"]),
  ]);
  const creditRows = check<{ kind: LedgerEntry["kind"]; amount_pence: number; parent_id: string }[]>("credit", creditRes);
  const bookings = toBookings(check("bookings", bookingsRes));
  const kidRows = check<Record<string, unknown>[]>("children", kidsRes);
  const one = <T,>(v: unknown): T | null => ((Array.isArray(v) ? v[0] : v) as T | undefined) ?? null;

  const children = kidRows.map<FamilyChild>((k) => {
    const a = one<Record<string, unknown>>(k.agreements);
    const s = one<{ approved_at: string | null; assessment_completed_at: string | null }>(k.student_status);
    const notes = ((k.tutor_notes as { id: string; created_at: string; body: string }[] | null) ?? [])
      .map((n) => ({ id: n.id, createdAt: new Date(n.created_at), body: n.body }))
      .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime());
    return {
      id: k.id as string,
      name: `${k.first_name} ${k.last_name}`,
      firstName: k.first_name as string,
      schoolYear: k.school_year as number,
      examBoard: k.exam_board as string,
      tier: k.tier as string,
      subjects: k.subjects as string[],
      targetGrade: (k.target_grade as string | null) ?? null,
      agreement: a
        ? {
            signedName: a.signed_name as string,
            signedAt: new Date(a.signed_at as string),
            policyVersion: a.policy_version as string,
            emergencyContactName: a.emergency_contact_name as string,
            emergencyContactPhone: a.emergency_contact_phone as string,
            medicalInfo: (a.medical_info as string | null) ?? null,
            senInfo: (a.sen_info as string | null) ?? null,
            consentContact: Boolean(a.consent_contact),
          }
        : null,
      approvedAt: s?.approved_at ? new Date(s.approved_at) : null,
      assessmentCompletedAt: s?.assessment_completed_at ? new Date(s.assessment_completed_at) : null,
      assessmentAttended: bookings.some((b) => b.childId === k.id && b.kind === "assessment" && b.status === "attended"),
      notes,
    };
  });
  const nameOf = new Map(children.map((k) => [k.id, k.name]));
  const since = now.getTime() - 365 * DAY;
  return {
    id: p.id,
    name: parentName(p),
    email: p.email,
    phone: p.phone,
    createdAt: new Date(p.created_at),
    isBlocked: p.is_blocked,
    blockedReason: p.blocked_reason,
    children,
    history: bookings.map((b) => ({
      booking: b,
      childName: nameOf.get(b.childId ?? "") ?? "Removed child",
      parentName: parentName(p),
      parentId: p.id,
      membership: b.blockBookingId ? "Block" : b.bundleId ? "Sunday bundle" : null,
      owedPence: amountOwedPence([b], [], now),
      blockReleased: false,
    })),
    owedPence: amountOwedPence(bookings, [], now),
    creditPence: creditBalancePence(
      creditRows.map((r) => ({ kind: r.kind, amountPence: r.amount_pence, parentId: r.parent_id })),
      p.id,
    ),
    flagCount: bookings.filter((b) => (b.status === "late_cancelled" || b.status === "no_show") && b.startsAt.getTime() >= since).length,
    flagged: isFlagged(bookings, now, settings.flagThreshold),
    settings,
  };
}
