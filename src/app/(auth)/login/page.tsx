import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/AuthCard";
import { LoginForm } from "@/components/auth/LoginForm";
import { explicitNextPath } from "@/lib/auth/validation";

export const metadata: Metadata = { title: "Log in" };

const NOTICES: Record<string, string> = {
  "confirm-failed":
    "That link has expired or has already been used. If you have already confirmed your email, log in below.",
  "password-updated": "Your password has been changed. Log in with the new one.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; notice?: string }>;
}) {
  const { next, notice } = await searchParams;
  return (
    <AuthCard title="Log in" intro={notice ? NOTICES[notice] : undefined}>
      <LoginForm next={explicitNextPath(next) ?? ""} />
    </AuthCard>
  );
}
