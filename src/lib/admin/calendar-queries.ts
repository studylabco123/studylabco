import "server-only";
import { LOCATION_LABEL } from "@/lib/admin/labels";
import { buildDays, type CalendarDay, type ViewBooking, type ViewSession } from "@/lib/calendar/view";
import {
  mapBlockedRule,
  mapBlockedTime,
  type BlockedRuleRow,
  type BlockedTimeRow,
} from "@/lib/supabase/mappers";
import { createServiceClient } from "@/lib/supabase/service";
import { addDays, londonDateTime } from "@/lib/time";

/** Read side of the admin calendar (callers have passed requireAdmin()). */

function check<T>(what: string, r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(`Could not load ${what}: ${r.error.message}`);
  return (r.data ?? []) as T;
}

/** The London dates [from, from + count) with everything that happens on them. */
export async function loadCalendarDays(dates: string[]): Promise<CalendarDay[]> {
  if (dates.length === 0) return [];
  const c = createServiceClient();
  const from = londonDateTime(dates[0], "00:00").toISOString();
  const to = londonDateTime(addDays(dates[dates.length - 1], 1), "00:00").toISOString();

  const [bookings, sessions, blocks, rules] = await Promise.all([
    c
      .from("bookings")
      .select("id, kind, location, starts_at, status, children(first_name, last_name)")
      .neq("kind", "group")
      .in("status", ["pending", "confirmed", "attended", "no_show"])
      .gte("starts_at", from)
      .lt("starts_at", to),
    c.from("group_sessions").select("id, title, starts_at, capacity").eq("status", "scheduled").gte("starts_at", from).lt("starts_at", to),
    c.from("blocked_times").select("*").lt("starts_at", to).gt("ends_at", from),
    c.from("blocked_rules").select("*").lte("valid_from", dates[dates.length - 1]).or(`valid_to.is.null,valid_to.gte.${dates[0]}`),
  ]);

  const sessionRows = check<{ id: string; title: string; starts_at: string; capacity: number }[]>("group sessions", sessions);
  const counts = new Map<string, number>();
  if (sessionRows.length) {
    const seats = check<{ group_session_id: string }[]>(
      "group seats",
      await c.from("bookings").select("group_session_id").in("group_session_id", sessionRows.map((s) => s.id)).in("status", ["pending", "confirmed", "attended"]),
    );
    for (const r of seats) counts.set(r.group_session_id, (counts.get(r.group_session_id) ?? 0) + 1);
  }

  type BookingRow = {
    id: string;
    kind: "assessment" | "one_to_one";
    location: keyof typeof LOCATION_LABEL;
    starts_at: string;
    status: string;
    children: { first_name: string; last_name: string } | null;
  };
  const viewBookings: ViewBooking[] = check<BookingRow[]>("bookings", bookings as never).map((b) => ({
    id: b.id,
    kind: b.kind,
    startsAt: new Date(b.starts_at),
    childName: b.children ? `${b.children.first_name} ${b.children.last_name}` : "Unknown child",
    locationLabel: LOCATION_LABEL[b.location],
    status: b.status,
  }));
  const viewSessions: ViewSession[] = sessionRows.map((s) => ({
    id: s.id,
    title: s.title,
    startsAt: new Date(s.starts_at),
    booked: counts.get(s.id) ?? 0,
    capacity: s.capacity,
  }));

  return buildDays(dates, {
    bookings: viewBookings,
    sessions: viewSessions,
    blocks: check<BlockedTimeRow[]>("blocks", blocks).map(mapBlockedTime),
    rules: check<BlockedRuleRow[]>("repeating blocks", rules).map(mapBlockedRule),
  });
}
