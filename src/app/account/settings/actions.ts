"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteAccount } from "@/lib/account-deletion";
import { POLICY_VERSION } from "@/lib/policy";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export type SettingsResult = { ok: true } | { ok: false; message: string };

/** Stores a consents row (kind 'marketing') and updates profiles.marketing_opt_in. Identity from the session. */
export async function setMarketingOptIn(on: boolean): Promise<SettingsResult> {
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, message: "Please log in again." };
  const c = createServiceClient();
  const consent = await c
    .from("consents")
    .insert({ profile_id: auth.user.id, kind: "marketing", policy_version: POLICY_VERSION, granted: Boolean(on) });
  if (consent.error) {
    console.error("setMarketingOptIn: consent", consent.error);
    return { ok: false, message: "We could not save your preference. Please try again." };
  }
  const profile = await c.from("profiles").update({ marketing_opt_in: Boolean(on) }).eq("id", auth.user.id);
  if (profile.error) {
    console.error("setMarketingOptIn: profile", profile.error);
    return { ok: false, message: "We could not save your preference. Please try again." };
  }
  revalidatePath("/account/settings");
  return { ok: true };
}

/** Deletes the signed-in parent's account (refused while money is owed), signs out and goes home. */
export async function deleteMyAccount(): Promise<SettingsResult> {
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, message: "Please log in again." };
  const res = await deleteAccount(auth.user.id);
  if (!res.ok) return { ok: false, message: res.message };
  await supabase.auth.signOut({ scope: "local" });
  redirect("/?notice=account-deleted");
}
