import "server-only";
import { generateSlots, type Slot } from "@/lib/calendar/slots";
import { getSettings } from "@/lib/settings";
import { londonDateOf, londonWeekday } from "@/lib/time";
import type { LocationKind } from "@/lib/types";
import { db, loadFamily, loadSlotData, mapDbError, recordCoolingOff, type ServiceOptions } from "./data";
import { checkEligibility } from "./eligibility";
import { onBookingCreated } from "./notify";
import { normalisePostcode } from "./postcode";
import { quote } from "./pricing";
import type { BookingResult } from "./results";

export { createBlockBooking, createGroupBooking, createSundayBundle } from "./group-service";
export type { ServiceOptions } from "./data";
export { onBookingCreated } from "./notify";

const LESSON_MS = 60 * 60_000;

/**
 * Free 1-to-1/assessment slots for London dates fromDate..toDate. `childId` is
 * accepted for symmetry with the booking call; callers must already have
 * checked the child belongs to the signed-in parent.
 */
export async function getAvailableSlots(
  childId: string,
  kind: "assessment" | "one_to_one",
  location: LocationKind,
  fromDate: string,
  toDate: string,
  opts: ServiceOptions = {},
): Promise<Slot[]> {
  void childId;
  const [settings, data] = await Promise.all([getSettings(), loadSlotData(fromDate, toDate)]);
  return generateSlots({ now: opts.now ?? new Date(), fromDate, toDate, kind, location, settings, ...data });
}

export interface CreateBookingInput {
  /** From the server session, never from the form. */
  parentId: string;
  childId: string;
  kind: "assessment" | "one_to_one";
  location: LocationKind;
  startsAt: Date;
  homeAddress?: string;
  postcode?: string;
  /** The cooling-off box was ticked. */
  coolingOff: boolean;
}

/** Books an Assessment Lesson or 1-to-1 lesson after re-checking every rule. */
export async function createBooking(input: CreateBookingInput, opts: ServiceOptions = {}): Promise<BookingResult> {
  const now = opts.now ?? new Date();
  const { parentId, childId, kind, location, startsAt } = input;

  if (location !== "tutor_place" && location !== "home_visit" && location !== "online") {
    return { ok: false, reason: kind === "assessment" ? "assessment_in_person_only" : "location_disabled" };
  }
  const family = await loadFamily(parentId, childId, now);
  if (!family) return { ok: false, reason: "child_not_found" };
  const { settings } = family;

  const date = londonDateOf(startsAt);
  const homeVisit = location === "home_visit";
  const eligibility = checkEligibility({
    profile: { isBlocked: family.isBlocked },
    owedPence: family.owedPence,
    hasAgreement: family.hasAgreement,
    assessmentBooked: family.assessmentBooked,
    approved: family.approved,
    request: { type: kind, location, londonWeekday: londonWeekday(date), postcode: input.postcode },
    settings,
  });
  if (!eligibility.ok) return eligibility;
  // Ruling R9: one Assessment Lesson per child.
  if (kind === "assessment" && (family.approved || family.assessmentBooked)) {
    return { ok: false, reason: "assessment_already_booked" };
  }

  const homeAddress = input.homeAddress?.trim() ?? "";
  // checkEligibility has already checked the postcode for home visits.
  if (homeVisit && !homeAddress) return { ok: false, reason: "address_required" };
  if (!input.coolingOff) return { ok: false, reason: "cooling_off_required" };

  const slots = generateSlots({
    now,
    fromDate: date,
    toDate: date,
    kind,
    location,
    settings,
    ...(await loadSlotData(date, date)),
  });
  if (!slots.some((s) => s.startsAt.getTime() === startsAt.getTime())) return { ok: false, reason: "slot_taken" };
  await opts.afterSlotCheck?.();

  const price = quote({ type: kind, location }, settings);
  const endsAt = new Date(startsAt.getTime() + LESSON_MS);
  const busyUntil = new Date(endsAt.getTime() + (homeVisit ? settings.homeVisitBufferMinutes * 60_000 : 0));
  const { data, error } = await db()
    .from("bookings")
    .insert({
      parent_id: parentId,
      child_id: childId,
      kind,
      location,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      busy_until: busyUntil.toISOString(),
      status: homeVisit ? "pending" : "confirmed",
      price_pence: price.basePence,
      travel_fee_pence: price.travelPence,
      home_address: homeVisit ? homeAddress : null,
      home_postcode: homeVisit ? normalisePostcode(input.postcode ?? "") : null,
    })
    .select("id")
    .single();
  if (error) {
    const reason = mapDbError(error);
    if (reason) return { ok: false, reason };
    throw new Error(`Could not create booking: ${error.message}`);
  }
  const bookingId = data.id as string;
  try {
    await recordCoolingOff(parentId, bookingId);
  } catch (err) {
    await db().from("bookings").delete().eq("id", bookingId);
    throw err;
  }
  await onBookingCreated([bookingId]);
  return { ok: true, bookingId };
}
