"use server";

import { redirect } from "next/navigation";
import { requireAdminAal1 } from "@/lib/admin-guard";
import { createServerClient } from "@/lib/supabase/server";

export interface EnrolmentState {
  factorId?: string;
  qrCode?: string;
  secret?: string;
  error?: string;
}

export interface VerifyState {
  error?: string;
}

const BAD_CODE = "That code didn't work. Please try again.";

/** Starts a fresh TOTP enrolment, discarding any half-finished one. */
export async function startEnrolment(): Promise<EnrolmentState> {
  await requireAdminAal1();
  const supabase = await createServerClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  if (factors?.totp.length) return { error: "Two-step verification is already set up." };
  for (const f of factors?.all ?? []) {
    if (f.factor_type === "totp" && f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Study Lab Co ${Date.now()}`,
    issuer: "Study Lab Co",
  });
  if (error || !data) return { error: "We couldn't start setup. Please refresh the page and try again." };
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/** Verifies a 6-digit code (enrolling the pending factor, or challenging the verified one) and moves to aal2. */
export async function verifyCode(_prev: VerifyState, formData: FormData): Promise<VerifyState> {
  await requireAdminAal1();
  const code = String(formData.get("code") ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) return { error: BAD_CODE };

  const supabase = await createServerClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const pending = String(formData.get("factorId") ?? "");
  const factorId = factors?.totp[0]?.id ?? (factors?.all.some((f) => f.id === pending) ? pending : "");
  if (!factorId) return { error: BAD_CODE };

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { error: error.status === 429 ? "Too many attempts. Please wait a minute and try again." : BAD_CODE };
  redirect("/admin");
}
