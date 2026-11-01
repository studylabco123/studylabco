import "server-only";
import { cache } from "react";
import { ensureGroupSessions } from "@/lib/booking/data";
import { getSettings } from "@/lib/settings";
import { FALLBACK_EMAIL } from "@/lib/site";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { addDays, londonDateOf } from "@/lib/time";
import type { Settings } from "@/lib/types";

/** Settings once per request (layout and page share it). */
export const publicSettings = cache((): Promise<Settings> => getSettings());

export interface SiteContact {
  email: string;
  phone: string | null;
  /** The business (virtual office) address, only when the owner has set one. Never the teaching address. */
  address: string | null;
}

/** Business contact details for the header, footer and contact page; falls back to the email alone. */
export const siteContact = cache(async (): Promise<SiteContact> => {
  try {
    const s = await publicSettings();
    return { email: FALLBACK_EMAIL, phone: s.businessPhone?.trim() || null, address: s.businessAddress?.trim() || null };
  } catch (err) {
    console.error("site contact: settings unavailable", err);
    return { email: FALLBACK_EMAIL, phone: null, address: null };
  }
});

export const NO_VENUE = "Location confirmed on booking";

export interface PublicGroup {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  yearGroup: string | null;
  seatsLeft: number;
  pricePence: number;
  /** The session's venue, else the default group venue, else NO_VENUE. */
  venue: string;
}

/**
 * Future scheduled group sessions within the booking window, earliest first.
 * Online groups are left out while online lessons are switched off. Seats come
 * from the seats_left() function, the same count the booking uses.
 */
export async function loadUpcomingGroups(now: Date, opts: { limit?: number } = {}): Promise<PublicGroup[]> {
  const settings = await publicSettings();
  const until = addDays(londonDateOf(now), settings.bookingWindowDays);
  await ensureGroupSessions(until);
  const c = createServiceClient();
  let q = c
    .from("group_sessions")
    .select("id, title, starts_at, ends_at, price_pence, venue, is_online, group_series(year_group)")
    .eq("status", "scheduled")
    .gt("starts_at", now.toISOString())
    .lt("starts_at", new Date(now.getTime() + settings.bookingWindowDays * 86_400_000).toISOString())
    .order("starts_at");
  if (!settings.onlineEnabled) q = q.eq("is_online", false);
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) throw new Error(`Could not load group sessions: ${error.message}`);
  type Row = {
    id: string;
    title: string;
    starts_at: string;
    ends_at: string;
    price_pence: number;
    venue: string | null;
    is_online: boolean;
    group_series: { year_group: string } | null;
  };
  const rows = data as unknown as Row[];
  const seats = await Promise.all(
    rows.map(async (r) => {
      const res = await c.rpc("seats_left", { p_session: r.id });
      if (res.error) throw new Error(`Could not count seats: ${res.error.message}`);
      return (res.data as number | null) ?? 0;
    }),
  );
  return rows.map((r, i) => ({
    id: r.id,
    title: r.title,
    startsAt: new Date(r.starts_at),
    endsAt: new Date(r.ends_at),
    yearGroup: r.group_series?.year_group ?? null,
    seatsLeft: seats[i],
    pricePence: r.price_pence,
    venue: r.is_online ? "Online" : r.venue?.trim() || settings.groupVenue?.trim() || NO_VENUE,
  }));
}

/** Active weekly groups (for the timetable summary). */
export async function loadGroupSeries(): Promise<{ weekday: number; startTime: string; active: boolean }[]> {
  const { data, error } = await createServiceClient()
    .from("group_series")
    .select("weekday, start_time, active, is_online")
    .eq("active", true);
  if (error) throw new Error(`Could not load groups: ${error.message}`);
  const s = await publicSettings();
  return (data as { weekday: number; start_time: string; active: boolean; is_online: boolean }[])
    .filter((r) => s.onlineEnabled || !r.is_online)
    .map((r) => ({ weekday: r.weekday, startTime: r.start_time.slice(0, 5), active: r.active }));
}

/** Where "Book" buttons go: the booking wizard when signed in, else sign-up. */
export const bookHref = cache(async (): Promise<string> => {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  return data.user ? "/account/book" : "/signup";
});
