"use server";

import { redirect } from "next/navigation";
import { commonAuthMessage } from "@/lib/auth/errors";
import { signupSchema } from "@/lib/auth/validation";
import { turnstileToken } from "@/lib/auth/turnstile-token";
import { POLICY_VERSION } from "@/lib/policy";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export type SignupField = "full_name" | "email" | "phone" | "password" | "age_guardian" | "terms";

export interface SignupState {
  errors?: Partial<Record<SignupField, string>>;
  formError?: string;
  /** Echoed back (never the password) so the form keeps what was typed. */
  values?: { full_name: string; email: string; phone: string; age_guardian: boolean; terms: boolean; marketing: boolean };
}

function text(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

export async function signUp(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const raw = Object.fromEntries(
    ["full_name", "email", "phone", "password", "age_guardian", "terms", "marketing"].flatMap((k) => {
      const v = formData.get(k);
      return typeof v === "string" ? [[k, v]] : [];
    }),
  );
  const values = {
    full_name: text(formData, "full_name"),
    email: text(formData, "email"),
    phone: text(formData, "phone"),
    age_guardian: formData.has("age_guardian"),
    terms: formData.has("terms"),
    marketing: formData.has("marketing"),
  };

  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: SignupState["errors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as SignupField;
      errors[field] ??= issue.message;
    }
    return { errors, values };
  }
  const input = parsed.data;

  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: { full_name: input.full_name, phone: input.phone },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback`,
      captchaToken: turnstileToken(formData),
    },
  });
  if (error) {
    const message =
      commonAuthMessage(error) ??
      (error.code === "weak_password"
        ? "That password is too easy to guess. Try a longer one."
        : "We could not create your account. Please check your details and try again.");
    return { formError: message, values };
  }

  // An already-registered email returns a user with no identities. Say nothing
  // different (no account enumeration) and record nothing for the fake id.
  const created = data.user && (data.user.identities?.length ?? 0) > 0;
  if (created && data.user) {
    // No session exists until the email is confirmed, so the consents are
    // written with the service client for the new user id.
    const service = createServiceClient();
    const rows = [
      { kind: "age_guardian", granted: true },
      { kind: "terms", granted: true },
      { kind: "marketing", granted: input.marketing },
    ].map((r) => ({ profile_id: data.user!.id, policy_version: POLICY_VERSION, ...r }));
    const consents = await service.from("consents").insert(rows);
    const profile = await service
      .from("profiles")
      .update({ marketing_opt_in: input.marketing })
      .eq("id", data.user.id);
    if (consents.error || profile.error) {
      // Do not leave an account without its consent record.
      await service.auth.admin.deleteUser(data.user.id);
      console.error("signup: could not record consents", consents.error ?? profile.error);
      return { formError: "Something went wrong creating your account. Please try again.", values };
    }
  }

  redirect(`/verify?email=${encodeURIComponent(input.email)}`);
}
