"use server";

import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth/validation";
import { turnstileToken } from "@/lib/auth/turnstile-token";
import { createServerClient } from "@/lib/supabase/server";

export interface LoginState {
  error?: string;
  email?: string;
}

export async function logIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? ""));
  if (!email || !password) return { error: "Enter your email and password.", email };

  const supabase = await createServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken: turnstileToken(formData) },
  });
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Please confirm your email first. Check your inbox for the link we sent.", email };
    }
    if (error.status === 429) return { error: "Too many attempts. Please wait a few minutes and try again.", email };
    return { error: "Email or password is incorrect.", email };
  }
  redirect(next);
}
