"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { addExpense as add, prepareReceiptUpload as prepare, recordRefund as refund, setMiles as miles, type ExpenseForm, type UploadTicket } from "@/lib/admin/money-ops";
import { convertPassToCredit as convert, markPassPaid as passPaid } from "@/lib/admin/pass-ops";
import { fail, type AdminResult } from "@/lib/admin/result";
import type { PaymentMethod } from "@/lib/types";

/**
 * Money actions. Each one calls requireAdmin() first: a layout guard does not
 * protect a server action, which can be invoked directly.
 */

const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;
const METHODS: readonly string[] = ["bank_transfer", "cash"];

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

/** The payment for a group pass arrived: it becomes active for passValidityMonths and the payment counts as income. */
export async function markPassPaid(passId: string, method: PaymentMethod): Promise<AdminResult> {
  await requireAdmin();
  if (!isId(passId) || !METHODS.includes(method)) return fail("Something was missing. Please refresh and try again.");
  return done(await passPaid(passId, method));
}

/** Ends a group pass at the tutor's discretion; a paid pass's unused sessions become account credit. */
export async function convertPassToCredit(passId: string): Promise<AdminResult> {
  await requireAdmin();
  if (!isId(passId)) return fail("Something was missing. Please refresh and try again.");
  return done(await convert(passId));
}
