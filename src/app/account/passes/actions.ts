"use server";

import { revalidatePath } from "next/cache";
import { cancelPassForParent } from "@/lib/booking/pass-service";
import { formatPence } from "@/lib/format";
import { createServerClient } from "@/lib/supabase/server";

export type CancelPassState = { ok: true; message: string } | { ok: false; message: string };

/** Cancels one of the signed-in parent's group passes inside its 14-day cooling-off. The identity comes from the session, never the client. */
export async function cancelPass(passId: string): Promise<CancelPassState> {
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, message: "Please log in again." };
  if (typeof passId !== "string" || passId.length > 64) return { ok: false, message: "We could not find that group pass." };

  const res = await cancelPassForParent(auth.user.id, passId);
  if (!res.ok) return { ok: false, message: res.message };
  revalidatePath("/account", "layout");
  return {
    ok: true,
    message:
      res.message ??
      (res.creditPence > 0
        ? `Your pass is cancelled. ${formatPence(res.creditPence)} for the unused sessions is now credit on your account.`
        : "Your pass is cancelled. Nothing is owed."),
  };
}
