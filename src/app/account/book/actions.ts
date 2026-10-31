"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { failureMessage, type BookingResult } from "@/lib/booking/results";
import {
  createBlockBooking,
  createBooking,
  createGroupBooking,
  createSundayBundle,
  getAvailableSlots,
} from "@/lib/booking/service";
import { formatLondon } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { createServerClient } from "@/lib/supabase/server";
import { addDays, londonDateOf, londonDateTime } from "@/lib/time";
import type { ConfirmPayload } from "./types";

/** The signed-in parent's id from the session cookie (never from input). */
async function parentId(): Promise<string> {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=%2Faccount%2Fbook");
  return data.user.id;
}

/** RLS limits the cookie client to the parent's own children. */
async function ownsChild(childId: string): Promise<boolean> {
  if (!z.uuid().safeParse(childId).success) return false;
  const supabase = await createServerClient();
  const { data } = await supabase.from("children").select("id").eq("id", childId).maybeSingle();
  return data !== null;
}

const slotRequest = z.object({
  childId: z.string(),
  kind: z.enum(["assessment", "one_to_one"]),
  location: z.enum(["tutor_place", "home_visit", "online"]),
});

/** Free slot start times (ISO) across the booking window. */
export async function loadSlots(input: z.input<typeof slotRequest>): Promise<{ slots: string[] }> {
  await parentId();
  const parsed = slotRequest.safeParse(input);
  if (!parsed.success || !(await ownsChild(parsed.data.childId))) return { slots: [] };
  const settings = await getSettings();
  const today = londonDateOf(new Date());
  const slots = await getAvailableSlots(
    parsed.data.childId,
    parsed.data.kind,
    parsed.data.location,
    today,
    addDays(today, settings.bookingWindowDays + 1),
  );
  return { slots: slots.map((s) => s.startsAt.toISOString()) };
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const confirmSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.enum(["assessment", "one_to_one"]),
    childId: z.string(),
    location: z.enum(["tutor_place", "home_visit", "online"]),
    startsAt: z.iso.datetime(),
    homeAddress: z.string().max(200).optional(),
    postcode: z.string().max(12).optional(),
    coolingOff: z.boolean(),
  }),
  z.object({ type: z.literal("group"), childId: z.string(), sessionId: z.string(), coolingOff: z.boolean() }),
  z.object({ type: z.literal("sunday_bundle"), childId: z.string(), date, coolingOff: z.boolean() }),
  z.object({
    type: z.literal("block"),
    childId: z.string(),
    product: z.enum(["saturday", "sunday_bundle"]),
    weeks: z.union([z.literal(6), z.literal(10)]),
    firstDate: date,
    coolingOff: z.boolean(),
  }),
]);

export interface ConfirmState {
  error?: string;
}

/** Creates the booking; on success redirects to its confirmation page. */
export async function confirmBooking(payload: ConfirmPayload): Promise<ConfirmState> {
  const parent = await parentId();
  const parsed = confirmSchema.safeParse(payload);
  if (!parsed.success) return { error: "Something went wrong with that booking. Please start again." };
  const p = parsed.data;

  let result: BookingResult;
  try {
    result = await create(parent, p);
  } catch (err) {
    console.error("confirmBooking failed", err);
    return { error: "We could not make that booking. Please try again." };
  }

  if (!result.ok) {
    const label = result.fullDate
      ? formatLondon(londonDateTime(result.fullDate, "12:00"), "EEEE d MMMM")
      : undefined;
    return { error: failureMessage(result.reason, label) };
  }
  redirect(`/account/bookings/${result.bookingId}`);
}

function create(parent: string, p: z.infer<typeof confirmSchema>): Promise<BookingResult> {
  switch (p.type) {
    case "assessment":
    case "one_to_one":
      return createBooking({
        parentId: parent,
        childId: p.childId,
        kind: p.type,
        location: p.location,
        startsAt: new Date(p.startsAt),
        homeAddress: p.homeAddress,
        postcode: p.postcode,
        coolingOff: p.coolingOff,
      });
    case "group":
      return createGroupBooking({ parentId: parent, ...p });
    case "sunday_bundle":
      return createSundayBundle({ parentId: parent, ...p });
    case "block":
      return createBlockBooking({ parentId: parent, ...p });
  }
}
