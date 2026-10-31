"use server";

import { redirect } from "next/navigation";
import { turnstileToken } from "@/lib/auth/turnstile-token";
import { createServerClient } from "@/lib/supabase/server";

export interface ResetState {
  error?: string;
  sent?: boolean;
}

export async function requestReset(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Enter your email address." };
  const supabase = await createServerClient();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${site}/auth/callback?next=${encodeURIComponent("/reset?mode=update")}`,
    captchaToken: turnstileToken(formData),
  });
  if (error?.status === 429) return { error: "Too many attempts. Please wait a few minutes and try again." };
  // Same answer whether or not the address has an account.
  return { sent: true };
}

export async function updatePassword(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 10) return { error: "Use at least 10 characters." };
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/reset");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return {
      error:
        error.code === "same_password"
          ? "Choose a password you have not used before."
          : "We could not change your password. Please request a new link.",
    };
  }
  redirect("/account");
}
