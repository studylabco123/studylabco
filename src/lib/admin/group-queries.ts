import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

/** Read side of the admin Groups page (callers have passed requireAdmin()). */

export interface SeriesView {
  id: string;
  title: string;
  weekday: number;
  startTime: string;
  capacity: number;
  pricePence: number;
  venue: string | null;
  isOnline: boolean;
  yearGroup: string;
  active: boolean;
  startsOn: string;
}

export interface SessionView {
  id: string;
  seriesId: string | null;
  title: string;
  startsAt: Date;
  capacity: number;
  pricePence: number;
  venue: string | null;
  isOnline: boolean;
  status: "scheduled" | "cancelled";
  booked: number;
  seatsLeft: number;
}

function check<T>(what: string, r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(`Could not load ${what}: ${r.error.message}`);
  return (r.data ?? []) as T;
}

export async function loadGroups(now: Date, weeks: number): Promise<{ series: SeriesView[]; sessions: SessionView[] }> {
  const c = createServiceClient();
  const from = new Date(now.getTime() - 3600_000).toISOString();
  const to = new Date(now.getTime() + weeks * 7 * 86_400_000).toISOString();
  const [series, sessions] = await Promise.all([
    c.from("group_series").select("*").order("active", { ascending: false }).order("weekday").order("start_time"),
    c.from("group_sessions").select("*").gte("starts_at", from).lt("starts_at", to).order("starts_at"),
  ]);
  type S = { id: string; title: string; weekday: number; start_time: string; capacity: number; price_pence: number; venue: string | null; is_online: boolean; year_group: string; active: boolean; starts_on: string };
  type G = { id: string; series_id: string | null; title: string; starts_at: string; capacity: number; price_pence: number; venue: string | null; is_online: boolean; status: "scheduled" | "cancelled" };
  const sessionRows = check<G[]>("group sessions", sessions);
  const counts = new Map<string, number>();
  if (sessionRows.length) {
    const seats = check<{ group_session_id: string }[]>(
      "seats",
      await c.from("bookings").select("group_session_id").in("group_session_id", sessionRows.map((s) => s.id)).in("status", ["pending", "confirmed", "attended"]),
    );
    for (const r of seats) counts.set(r.group_session_id, (counts.get(r.group_session_id) ?? 0) + 1);
  }
  return {
    series: check<S[]>("groups", series).map((s) => ({
      id: s.id,
      title: s.title,
      weekday: s.weekday,
      startTime: s.start_time.slice(0, 5),
      capacity: s.capacity,
      pricePence: s.price_pence,
      venue: s.venue,
      isOnline: s.is_online,
      yearGroup: s.year_group,
      active: s.active,
      startsOn: s.starts_on,
    })),
    sessions: sessionRows.map((s) => {
      const booked = counts.get(s.id) ?? 0;
      return {
        id: s.id,
        seriesId: s.series_id,
        title: s.title,
        startsAt: new Date(s.starts_at),
        capacity: s.capacity,
        pricePence: s.price_pence,
        venue: s.venue,
        isOnline: s.is_online,
        status: s.status,
        booked,
        seatsLeft: Math.max(0, s.capacity - booked),
      };
    }),
  };
}
