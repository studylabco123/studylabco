import "server-only";
import { passExpiryFrom } from "@/lib/booking/pass";
import { endPass } from "@/lib/booking/pass-service";
import { getSettings } from "@/lib/settings";
import { mapPass, type PassRow } from "@/lib/supabase/mappers";
import { createServiceClient } from "@/lib/supabase/service";
import { londonDateOf } from "@/lib/time";
import type { Pass, PaymentMethod } from "@/lib/types";
import { fail, OK, unexpected, type AdminResult, type Failure, type OpOptions } from "./result";

// Group passes, admin side. Callers (server actions) must have passed requireAdmin().

const db = () => createServiceClient();
const PASS_NOT_FOUND = fail("We could not find that group pass.");

async function loadPass(id: string): Promise<{ pass: Pass } | { error: Failure }> {
  const { data, error } = await db().from("passes").select("*").eq("id", id).maybeSingle();
  if (error) return { error: error.code === "22P02" ? PASS_NOT_FOUND : unexpected("load pass", error) };
  if (!data) return { error: PASS_NOT_FOUND };
  return { pass: mapPass(data as PassRow) };
}

/**
 * The payment for a pass arrived: status 'active', paid_at now, expires_at
 * `passValidityMonths` calendar months later (London), and one ledger
 * 'payment' for the pass price with pass_id, dated today in London (income).
 * Conditional on 'awaiting_payment', so a double click writes one payment;
 * if the ledger insert fails the pass goes back to awaiting payment.
 */
export async function markPassPaid(passId: string, method: PaymentMethod, opts: OpOptions = {}): Promise<AdminResult> {
  const now = opts.now ?? new Date();
  const found = await loadPass(passId);
  if ("error" in found) return found.error;
  const { pass } = found;
  if (pass.status !== "awaiting_payment") return fail("This group pass is not waiting for payment.");

  const { passValidityMonths } = await getSettings();
  const flipped = await db()
    .from("passes")
    .update({ status: "active", paid_at: now.toISOString(), expires_at: passExpiryFrom(now, passValidityMonths).toISOString() })
    .eq("id", passId)
    .eq("status", "awaiting_payment")
    .select("id");
  if (flipped.error) return unexpected("mark pass paid", flipped.error);
  if (!flipped.data?.length) return fail("This group pass was just updated. Please refresh and check.");

  const entry = await db().from("ledger").insert({
    pass_id: passId,
    parent_id: pass.parentId,
    kind: "payment",
    method,
    amount_pence: pass.pricePence,
    occurred_on: londonDateOf(now),
    note: `Group pass (${pass.level}, ${pass.sessionsTotal} sessions)`,
  });
  if (entry.error) {
    await db().from("passes").update({ status: "awaiting_payment", paid_at: null, expires_at: null }).eq("id", passId);
    return unexpected("write pass payment", entry.error);
  }
  return OK;
}

/**
 * The tutor's discretion: ends a pass at any time. A paid pass (active or
 * expired) turns the value of its unused sessions into account credit (see
 * `endPass`); an unpaid one is simply cancelled (nothing was paid, nothing is owed).
 */
export async function convertPassToCredit(passId: string, opts: OpOptions = {}): Promise<AdminResult> {
  const now = opts.now ?? new Date();
  const found = await loadPass(passId);
  if ("error" in found) return found.error;
  const { pass } = found;
  if (pass.status === "cancelled") return fail("This group pass has already ended.");
  try {
    const r = await endPass(pass, now, { by: "tutor", note: "Group pass converted to credit" });
    return r.ok ? OK : fail(r.message);
  } catch (err) {
    console.error("admin: convert pass failed", err);
    return fail("Something went wrong. Please try again.");
  }
}
