import "server-only";
import { formatPence } from "@/lib/format";
import { mapBooking, type BookingRow } from "@/lib/supabase/mappers";
import { createServiceClient } from "@/lib/supabase/service";
import { amountOwedPence } from "@/lib/booking/owed";

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; reason: "money_owed"; owedPence: number; message: string }
  | { ok: false; reason: "error"; message: string };

/**
 * Deletes a parent's account (service client; the caller passes the id of the
 * signed-in user, never a client-supplied id).
 *
 * Refuses while money is owed. Otherwise, in this order: detach bookings
 * (parent, child, home address and postcode set to null; price, travel fee,
 * status, dates and the ledger are kept), delete consents, delete children
 * (cascades agreements, notes and student status), and finally delete the auth
 * user (cascades the profile; ledger/block rows keep their amounts with a null
 * parent). The auth user goes last so a failure part-way leaves an account
 * that can still log in and retry, never a half-deleted one that cannot. Every
 * step is safe to repeat. On any failure we stop and report.
 */
export async function deleteAccount(parentId: string, opts: { now?: Date } = {}): Promise<DeleteAccountResult> {
  const now = opts.now ?? new Date();
  const c = createServiceClient();
  const failed = (what: string, error: { message: string }): DeleteAccountResult => {
    console.error(`deleteAccount: ${what}`, error);
    return {
      ok: false,
      reason: "error",
      message: "We could not delete your account. Nothing further was changed; please try again or contact Study Lab Co.",
    };
  };

  const bookings = await c.from("bookings").select("*").eq("parent_id", parentId);
  if (bookings.error) return failed("load bookings", bookings.error);
  const owedPence = amountOwedPence((bookings.data as BookingRow[]).map(mapBooking), [], now);
  if (owedPence > 0) {
    return {
      ok: false,
      reason: "money_owed",
      owedPence,
      message: `You still owe ${formatPence(owedPence)}. We keep a record of what is owed, so please pay your balance before deleting your account.`,
    };
  }

  const detach = await c
    .from("bookings")
    .update({ parent_id: null, child_id: null, home_address: null, home_postcode: null })
    .eq("parent_id", parentId);
  if (detach.error) return failed("detach bookings", detach.error);

  const consents = await c.from("consents").delete().eq("profile_id", parentId);
  if (consents.error) return failed("delete consents", consents.error);

  const children = await c.from("children").delete().eq("parent_id", parentId);
  if (children.error) return failed("delete children", children.error);

  const user = await c.auth.admin.deleteUser(parentId);
  if (user.error) return failed("delete auth user", user.error);
  return { ok: true };
}
