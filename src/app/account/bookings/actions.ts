"use server";

import { revalidatePath } from "next/cache";
import { cancelBookingForParent } from "@/lib/booking/cancel";
import { createServerClient } from "@/lib/supabase/server";

export type CancelState =
  | { status: "cancelled"; outcome: "free" | "late"; feePence: number }
  | { status: "needs_confirmation"; feePence: number }
  | { status: "error"; message: string };

/** Cancels one of the signed-in parent's bookings. The identity comes from the session, never the client. */
export async function cancelBooking(bookingId: string, confirmLate = false): Promise<CancelState> {
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { status: "error", message: "Please log in again." };

  const res = await cancelBookingForParent(auth.user.id, bookingId, { confirmLate });
  if (res.ok) {
    revalidatePath("/account", "layout");
    return { status: "cancelled", outcome: res.outcome, feePence: res.feePence };
  }
  if (res.reason === "late_confirmation_needed") return { status: "needs_confirmation", feePence: res.feePence };
  return {
    status: "error",
    message:
      res.reason === "not_cancellable"
        ? "This booking can no longer be cancelled on the website. Please contact Study Lab Co."
        : res.reason === "not_found"
          ? "We could not find that booking."
          : "We could not cancel this booking. Please try again.",
  };
}
