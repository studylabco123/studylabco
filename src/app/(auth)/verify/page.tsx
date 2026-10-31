import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";

export const metadata: Metadata = { title: "Check your email" };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <AuthCard
      title="Check your email"
      intro={
        email ? (
          <>
            We have sent a confirmation link to <strong className="font-semibold text-navy-900">{email}</strong>.
          </>
        ) : (
          "We have sent you a confirmation link."
        )
      }
    >
      <div className="flex flex-col gap-3 text-body">
        <p>Open the link to confirm your email address, then you can book your assessment lesson.</p>
        <p className="text-small text-navy-600">
          Nothing there after a few minutes? Check your spam folder, or{" "}
          <Link href="/signup" className="underline underline-offset-4 hover:text-navy-900">
            try signing up again
          </Link>
          .
        </p>
      </div>
    </AuthCard>
  );
}
