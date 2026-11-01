import { AuthCard } from "@/components/auth/AuthCard";
import { requireAdminAal1 } from "@/lib/admin-guard";
import { createServerClient } from "@/lib/supabase/server";
import { MfaForm } from "./MfaForm";

export default async function MfaPage() {
  await requireAdminAal1();
  const supabase = await createServerClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const enrolled = (factors?.totp.length ?? 0) > 0;
  return (
    <AuthCard
      title={enrolled ? "Enter your code" : "Set up two-step verification"}
      intro={enrolled ? "Open your authenticator app and enter the 6-digit code for Study Lab Co." : undefined}
    >
      <MfaForm enrolled={enrolled} />
    </AuthCard>
  );
}
