import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/AuthCard";
import { SignupForm } from "@/components/auth/SignupForm";

export const metadata: Metadata = { title: "Create an account" };

export default function SignupPage() {
  return (
    <AuthCard title="Create your parent account" intro="You will need an account to book your child's £10 assessment lesson.">
      <SignupForm />
    </AuthCard>
  );
}
