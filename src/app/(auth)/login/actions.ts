"use server";

import { redirect } from "next/navigation";
import { commonAuthMessage } from "@/lib/auth/errors";
import { loginDestination } from "@/lib/auth/validation";
import { turnstileToken } from "@/lib/auth/turnstile-token";
import { createServerClient } from "@/lib/supabase/server";

export interface LoginState {
  error?: string;
  email?: string;
}

export async function logIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");
  if (!email || !password) return { error: "Enter your email and password.", email };

  const supabase = await createServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken: turnstileToken(formData) },
  });
  if (error) {
    const common = commonAuthMessage(error);
    if (common) return { error: common, email };
    if (error.code === "email_not_confirmed") {
      return { error: "Please confirm your email first. Check your inbox for the link we sent.", email };
    }
    return { error: "Email or password is incorrect.", email };
  }

  // Admins go to /admin (which asks for the 2-step code); an explicit safe `next` always wins.
  let role: string | null = null;
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
    role = (profile?.role as string | undefined) ?? null;
  }
  redirect(loginDestination(next, role));
}
