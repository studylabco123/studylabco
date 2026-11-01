import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/AuthCard";
import { NewPasswordForm, RequestResetForm } from "@/components/auth/ResetForms";
import { createServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reset your password" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ mode?: string; notice?: string }> }) {
  const { mode, notice } = await searchParams;
  if (mode === "update") {
    const supabase = await createServerClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      return (
        <AuthCard title="Choose a new password">
          <NewPasswordForm />
        </AuthCard>
      );
    }
  }
  return (
    <AuthCard
      title="Reset your password"
      intro={
        notice === "link-failed"
          ? "That reset link has expired or has already been used. Enter your email and we will send you a new one."
          : "Enter your email and we will send you a link to choose a new password."
      }
    >
      <RequestResetForm />
    </AuthCard>
  );
}
