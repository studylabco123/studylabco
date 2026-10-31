"use server";

import { redirect } from "next/navigation";
import { agreementSchema, normaliseName } from "@/lib/children/validation";
import { POLICY_VERSION } from "@/lib/policy";
import { createServerClient } from "@/lib/supabase/server";

export type AgreementField =
  | "emergency_contact_name"
  | "emergency_contact_phone"
  | "medical_info"
  | "sen_info"
  | "consent_contact"
  | "agree"
  | "signed_name";

export interface AgreementState {
  errors?: Partial<Record<AgreementField, string>>;
  formError?: string;
  values?: {
    emergency_contact_name: string;
    emergency_contact_phone: string;
    medical_info: string;
    sen_info: string;
    consent_contact: boolean;
    agree: boolean;
    signed_name: string;
  };
}

function text(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Bound to the child id in the page; useActionState supplies (prev, formData). */
export async function signAgreement(childId: string, _prev: AgreementState, formData: FormData): Promise<AgreementState> {
  const raw = {
    emergency_contact_name: text(formData, "emergency_contact_name"),
    emergency_contact_phone: text(formData, "emergency_contact_phone"),
    medical_info: text(formData, "medical_info"),
    sen_info: text(formData, "sen_info"),
    consent_contact: formData.has("consent_contact") ? "on" : undefined,
    agree: formData.has("agree") ? "on" : undefined,
    signed_name: text(formData, "signed_name"),
  };
  const values = { ...raw, consent_contact: formData.has("consent_contact"), agree: formData.has("agree") };

  const here = `/account/children/${childId}/agreement`;
  if (!UUID.test(childId)) return { formError: "We could not find that child.", values };

  const parsed = agreementSchema.safeParse(raw);
  const errors: AgreementState["errors"] = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as AgreementField;
      errors[field] ??= issue.message;
    }
  }

  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(`/login?next=${encodeURIComponent(here)}`);

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", auth.user.id).single();
  if (parsed.success && normaliseName(parsed.data.signed_name) !== normaliseName(profile?.full_name ?? "")) {
    errors.signed_name = "Type your name exactly as it appears on your account";
  }
  if (!parsed.success || Object.keys(errors).length > 0) return { errors, values };

  // RLS: the child must belong to this parent, otherwise no row is visible/insertable.
  const { data: child } = await supabase.from("children").select("id").eq("id", childId).maybeSingle();
  if (!child) return { formError: "We could not find that child.", values };

  const { error } = await supabase.from("agreements").insert({
    child_id: childId,
    policy_version: POLICY_VERSION,
    emergency_contact_name: parsed.data.emergency_contact_name,
    emergency_contact_phone: parsed.data.emergency_contact_phone,
    medical_info: parsed.data.medical_info,
    sen_info: parsed.data.sen_info,
    consent_contact: true,
    signed_name: parsed.data.signed_name,
    signed_at: new Date().toISOString(),
  });
  // 23505: already signed (unique index). Fall through to the summary.
  if (error && error.code !== "23505") {
    console.error("signAgreement failed", error);
    return { formError: "We could not save the agreement. Please try again.", values };
  }
  redirect(here);
}
