"use client";

import Link from "next/link";
import { useActionState } from "react";
import { logIn, type LoginState } from "@/app/(auth)/login/actions";
import { FormError } from "@/components/auth/AuthCard";
import { Turnstile } from "@/components/auth/Turnstile";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";

const linkClass = "underline underline-offset-4 hover:text-navy-600";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(logIn, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      {state.error ? <FormError>{state.error}</FormError> : null}
      <input type="hidden" name="next" value={next} />
      <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={state.email} required />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required />
      <Turnstile />
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Logging in…" : "Log in"}
      </Button>
      <p className="flex flex-col gap-2 text-small text-navy-600">
        <Link href="/reset" className={linkClass}>
          Forgotten your password?
        </Link>
        <span>
          New here?{" "}
          <Link href="/signup" className={linkClass}>
            Create an account
          </Link>
        </span>
      </p>
    </form>
  );
}
