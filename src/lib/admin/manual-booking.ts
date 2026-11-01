import "server-only";
import { onBookingCreated } from "@/lib/booking/notify";
import { assessmentLevel } from "@/lib/booking/level";
import { quote } from "@/lib/booking/pricing";
import { normalisePostcode } from "@/lib/booking/postcode";
import { getSettings } from "@/lib/settings";
import { createServiceClient } from "@/lib/supabase/service";
import { londonDateOf, londonDateTime } from "@/lib/time";
import type { Level, LocationKind } from "@/lib/types";
import { fail, unexpected, type Failure, type OpOptions } from "./result";

export interface ManualBookingInput {
  parentId: string;
  childId: string;
  kind: "assessment" | "one_to_one";
  location: Extract<LocationKind, "tutor_place" | "home_visit" | "online">;
  /** London local date 'YYYY-MM-DD' and time 'HH:mm'. */
  date: string;
  time: string;
  homeAddress?: string;
  postcode?: string;
}

export type ManualBookingResult = { ok: true; bookingId: string } | Failure;

const LESSON_MS = 60 * 60_000;

/**
 * The tutor adds a booking by hand: no eligibility, approval, slot, notice or
 * location-toggle rules (so 'online' works even when it is switched off for
 * parents). Database constraints still apply: an overlap is refused. The
 * booking is confirmed and priced from the current settings, and the family
 * is emailed the usual confirmation (an email failure never undoes it).
 */
export async function addManualBooking(input: ManualBookingInput, opts: OpOptions = {}): Promise<ManualBookingResult> {
  const now = opts.now ?? new Date();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^\d{1,2}:\d{2}$/.test(input.time)) {
    return fail("Enter a date and a time.");
  }
  let startsAt: Date;
  try {
    startsAt = londonDateTime(input.date, input.time);
  } catch {
    return fail("Enter a valid date and time.");
  }
  if (Number.isNaN(startsAt.getTime()) || londonDateOf(startsAt) !== input.date) return fail("Enter a valid date and time.");
  if (input.kind !== "assessment" && input.kind !== "one_to_one") return fail("Choose a lesson type.");
  if (!["tutor_place", "home_visit", "online"].includes(input.location)) return fail("Choose where the lesson happens.");
  const homeVisit = input.location === "home_visit";
  const address = input.homeAddress?.trim() ?? "";
  if (homeVisit && !address) return fail("Enter the address for the home visit.");

  const c = createServiceClient();
  const child = await c.from("children").select("id, school_year, level").eq("id", input.childId).eq("parent_id", input.parentId).maybeSingle();
  if (child.error) return child.error.code === "22P02" ? fail("We could not find that child.") : unexpected("load child", child.error);
  if (!child.data) return fail("We could not find that child.");

  const settings = await getSettings();
  const price = quote(
    {
      type: input.kind,
      level: input.kind === "assessment" ? assessmentLevel(child.data.school_year as number, child.data.level as Level) : (child.data.level as Level),
      location: input.location,
    },
    settings,
  );
  const endsAt = new Date(startsAt.getTime() + LESSON_MS);
  const busyUntil = new Date(endsAt.getTime() + (homeVisit ? settings.homeVisitBufferMinutes * 60_000 : 0));
  const { data, error } = await c
    .from("bookings")
    .insert({
      parent_id: input.parentId,
      child_id: input.childId,
      kind: input.kind,
      location: input.location,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      busy_until: busyUntil.toISOString(),
      status: "confirmed",
      decided_at: homeVisit ? now.toISOString() : null,
      price_pence: price.basePence,
      travel_fee_pence: price.travelPence,
      home_address: homeVisit ? address : null,
      home_postcode: homeVisit && input.postcode ? normalisePostcode(input.postcode) : null,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23P01") return fail("That time overlaps another booking.");
    return unexpected("add manual booking", error);
  }
  if (homeVisit) {
    const m = await c.from("mileage").insert({ booking_id: data.id, trip_on: input.date, miles: null, note: "Home visit" });
    if (m.error) console.error("admin: mileage row failed", m.error.message);
  }
  // The family gets the usual confirmation (reference, payment details). Email failures are caught and logged inside.
  await onBookingCreated([data.id as string]);
  return { ok: true, bookingId: data.id as string };
}
