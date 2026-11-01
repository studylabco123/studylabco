"use server";

import { revalidatePath } from "next/cache";
import { cancelBookingForParent } from "@/lib/booking/cancel";
import { getSettings } from "@/lib/settings";
import { createServerClient } from "@/lib/supabase/server";

export type CancelState =
  | { status: "cancelled"; outcome: "free"; feePence: 0 }
  | { status: "call_required"; message: string }
  | { status: "error"; message: string };


/** Cancels one of the signed-in parent's bookings (free, at least the notice period ahead). The identity comes from the session, never the client. */
export async function cancelBooking(bookingId: string): Promise<CancelState> {
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { status: "error", message: "Please log in again." };

  const res = await cancelBookingForParent(auth.user.id, bookingId);
  if (res.ok) {
    revalidatePath("/account", "layout");
    return { status: "cancelled", outcome: "free", feePence: 0 };
  }
  if (res.reason === "call_required") {
    const s = await getSettings();
    return {
      status: "call_required",
      message: `Less than ${s.cancellationNoticeHours} hours to go — please call or email Study Lab Co to cancel. A ${s.lateFeePercent}% late cancellation fee applies.`,
    };
  }
  return {
    status: "error",
    message:
      res.reason === "not_cancellable" || res.reason === "pass_seat"
        ? "This booking can no longer be cancelled on the website. Please contact Study Lab Co."
        : res.reason === "not_found"
          ? "We could not find that booking."
          : "We could not cancel this booking. Please try again.",
  };
}
