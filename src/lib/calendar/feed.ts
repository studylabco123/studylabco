import "server-only";
import { LOCATION_LABEL, KIND_LABEL } from "@/lib/admin/labels";
import type { CalendarEntry } from "@/lib/calendar/ics";
import { getSettings } from "@/lib/settings";
import { createServiceClient } from "@/lib/supabase/service";

/** What the private calendar feed lists: -30 .. +120 days around `now`. */
export const FEED_PAST_DAYS = -30;
export const FEED_FUTURE_DAYS = 120;
const DAY = 86_400_000;

const SUBJECT_SHORT: Record<string, string> = {
  Biology: "Bio",
  Chemistry: "Chem",
  Physics: "Phys",
  "Combined Science": "Comb Sci",
};

interface BookingRow {
  id: string;
  kind: "assessment" | "one_to_one" | "group";
  location: "tutor_place" | "home_visit" | "online" | "group_venue";
  starts_at: string;
  ends_at: string;
  children: { first_name: string; school_year: number; exam_board: string; subjects: string[] } | null;
}

interface SessionRow {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  venue: string | null;
  is_online: boolean;
}

/**
 * Titles carry first name, year, board and subject only. Medical and SEN
 * information, and any home address, are deliberately never read here.
 */
export async function loadFeedEntries(now: Date = new Date()): Promise<CalendarEntry[]> {
  const c = createServiceClient();
  const from = new Date(now.getTime() + FEED_PAST_DAYS * DAY).toISOString();
  const to = new Date(now.getTime() + FEED_FUTURE_DAYS * DAY).toISOString();

  const [bookings, sessions, settings] = await Promise.all([
    c
      .from("bookings")
      .select("id, kind, location, starts_at, ends_at, children(first_name, school_year, exam_board, subjects)")
      .neq("kind", "group")
      .in("status", ["pending", "confirmed", "attended", "no_show"])
      .gte("starts_at", from)
      .lt("starts_at", to)
      .order("starts_at"),
    c
      .from("group_sessions")
      .select("id, title, starts_at, ends_at, venue, is_online")
      .eq("status", "scheduled")
      .gte("starts_at", from)
      .lt("starts_at", to)
      .order("starts_at"),
    getSettings(),
  ]);
  if (bookings.error) throw new Error(`Could not load bookings for the feed: ${bookings.error.message}`);
  if (sessions.error) throw new Error(`Could not load group sessions for the feed: ${sessions.error.message}`);

  const sessionRows = sessions.data as SessionRow[];
  const counts = new Map<string, number>();
  if (sessionRows.length) {
    const seats = await c
      .from("bookings")
      .select("group_session_id")
      .in("group_session_id", sessionRows.map((s) => s.id))
      .in("status", ["pending", "confirmed", "attended"]);
    if (seats.error) throw new Error(`Could not count group seats for the feed: ${seats.error.message}`);
    for (const r of seats.data as { group_session_id: string }[]) {
      counts.set(r.group_session_id, (counts.get(r.group_session_id) ?? 0) + 1);
    }
  }

  const entries: CalendarEntry[] = [];
  for (const b of bookings.data as unknown as BookingRow[]) {
    const ch = b.children;
    const who = ch
      ? `${ch.first_name} (Y${ch.school_year}, ${ch.exam_board} ${ch.subjects.map((s) => SUBJECT_SHORT[s] ?? s).join("/")})`
      : "Student";
    const where = LOCATION_LABEL[b.location];
    entries.push({
      uid: `booking-${b.id}@studylabco`,
      start: new Date(b.starts_at),
      end: new Date(b.ends_at),
      title: `${KIND_LABEL[b.kind]} — ${who} — ${where}`,
      location: where,
    });
  }
  for (const s of sessionRows) {
    entries.push({
      uid: `group-${s.id}@studylabco`,
      start: new Date(s.starts_at),
      end: new Date(s.ends_at),
      title: `Group: ${s.title} (${counts.get(s.id) ?? 0} booked)`,
      location: s.is_online ? "Online" : (s.venue ?? settings.groupVenue ?? null),
    });
  }
  return entries.sort((a, b) => a.start.getTime() - b.start.getTime());
}
