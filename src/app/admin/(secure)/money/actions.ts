"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { addExpense as add, prepareReceiptUpload as prepare, recordRefund as refund, setMiles as miles, type ExpenseForm, type UploadTicket } from "@/lib/admin/money-ops";
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

export async function prepareReceiptUpload(type: string, size: number, spentOn: string): Promise<UploadTicket> {
  await requireAdmin();
  return prepare(type, size, spentOn);
}

export async function addExpense(input: ExpenseForm): Promise<AdminResult> {
  await requireAdmin();
  return done(await add(input));
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
