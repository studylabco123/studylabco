"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { addExpense as add, recordRefund as refund, setMiles as miles } from "@/lib/admin/money-ops";
import { fail, type AdminResult } from "@/lib/admin/result";

/**
 * Money actions. Each one calls requireAdmin() first: a layout guard does not
 * protect a server action, which can be invoked directly.
 */

const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;

function done(res: AdminResult): AdminResult {
  if (res.ok) revalidatePath("/admin", "layout");
  return res;
}

export async function addExpense(formData: FormData): Promise<AdminResult> {
  await requireAdmin();
  // Two file inputs: "Take a photo" (camera) and "Choose a file" (photo or PDF). Use whichever was filled.
  const picks = [formData.get("receipt"), formData.get("receiptFile")];
  const file = picks.find((f): f is File => f instanceof File && f.size > 0) ?? null;
  return done(
    await add({
      date: formData.get("date"),
      category: formData.get("category"),
      description: formData.get("description"),
      amount: formData.get("amount"),
      receipt: file,
    }),
  );
}

export async function setMiles(mileageId: string, value: string): Promise<AdminResult> {
  await requireAdmin();
  if (!isId(mileageId)) return fail("Something was missing. Please refresh and try again.");
  return done(await miles(mileageId, value));
}

export async function recordRefund(bookingId: string, amount: string): Promise<AdminResult> {
  await requireAdmin();
  if (!isId(bookingId)) return fail("Choose the booking to refund.");
  return done(await refund(bookingId, amount));
}
