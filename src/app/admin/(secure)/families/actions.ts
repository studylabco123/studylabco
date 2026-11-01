"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { adjustCredit as adjust, refundCredit as refund } from "@/lib/admin/credit-ops";
import { addNote as note, approveStudent as approve, setBlocked as block } from "@/lib/admin/family-ops";
import { addManualBooking as addBooking, type ManualBookingInput, type ManualBookingResult } from "@/lib/admin/manual-booking";
import { fail, type AdminResult } from "@/lib/admin/result";
import { poundsToPence } from "@/lib/admin/settings-validation";
import type { PaymentMethod } from "@/lib/types";

/** Family actions. Each one calls requireAdmin() first (see bookings/actions.ts). */

const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;
const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.slice(0, max) : "");
const BAD = "Something was missing. Please refresh and try again.";

function done<T extends { ok: boolean }>(res: T): T {
  if (res.ok) revalidatePath("/admin", "layout");
  return res;
}

export async function approveStudent(childId: string): Promise<AdminResult> {
  await requireAdmin();
  if (!isId(childId)) return fail(BAD);
  return done(await approve(childId));
}

export async function setBlocked(parentId: string, blocked: boolean, reason: string): Promise<AdminResult> {
  await requireAdmin();
  if (!isId(parentId)) return fail(BAD);
  return done(await block(parentId, blocked === true, str(reason, 1000)));
}

export async function addNote(childId: string, body: string): Promise<AdminResult> {
  await requireAdmin();
  if (!isId(childId)) return fail(BAD);
  return done(await note(childId, str(body, 10_000)));
}

export async function addManualBooking(input: ManualBookingInput): Promise<ManualBookingResult> {
  await requireAdmin();
  if (!input || !isId(input.parentId) || !isId(input.childId)) return fail(BAD);
  return done(
    await addBooking({
      parentId: input.parentId,
      childId: input.childId,
      kind: input.kind,
      location: input.location,
      date: str(input.date, 10),
      time: str(input.time, 5),
      homeAddress: str(input.homeAddress, 300),
      postcode: str(input.postcode, 12),
    }),
  );
}

const AMOUNT_BAD = "Enter an amount in pounds, like 5 or 12.50.";

/** Adds or removes credit from a family's balance; the amount is typed in pounds, the reason is required. */
export async function adjustFamilyCredit(parentId: string, amount: string, direction: "add" | "remove", reason: string): Promise<AdminResult> {
  await requireAdmin();
  if (!isId(parentId)) return fail(BAD);
  const pence = typeof amount === "string" ? poundsToPence(amount) : null;
  if (pence === null || pence <= 0) return fail(AMOUNT_BAD);
  return done(await adjust(parentId, pence, direction === "remove" ? "remove" : "add", str(reason, 1000)));
}

/** Refunds some of a family's credit to them (bank transfer or cash); uses the credit up. */
export async function refundFamilyCredit(parentId: string, amount: string, method: PaymentMethod): Promise<AdminResult> {
  await requireAdmin();
  if (!isId(parentId)) return fail(BAD);
  const pence = typeof amount === "string" ? poundsToPence(amount) : null;
  if (pence === null || pence <= 0) return fail(AMOUNT_BAD);
  return done(await refund(parentId, pence, method === "cash" ? "cash" : "bank_transfer"));
}
